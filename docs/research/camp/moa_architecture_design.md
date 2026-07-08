# ROM-AI MoA Lite 架构设计文档

> **版本**: v0.1
> **日期**: 2026-06-29
> **作者**: Orchestrator Agent
> **性质**: 技术架构设计文档（非产品 PRD）
> **范围**: MoA Lite 原生实现 —— 多模型专家委员会调度层

---

## 0. 状态校正（2026-06-29，以此为准）

> 本文是早期设计稿，部分内容与**已落地实现**不符，阅读时请以下列校正为准；沉淀方案另见 [`docs/moa-persistence-design.md`](docs/moa-persistence-design.md)。

| 本文旧描述 | 实际现状 |
|---|---|
| asyncio + httpx.AsyncClient 并发 | 实为 `ThreadPoolExecutor` 并发（`moa.py`），复用现有同步 `chat_completion` |
| 已建 `MoAConfig` / `MoAChain` 表 | **均未建**。预设固定在 `moa.py` 的 `BUILTIN_MOA_PRESETS` 代码里；沉淀目前只落 `ProjectAnalysis`（仅聚合 JSON，三专家原话未持久化） |
| 单次成本 ¥0.13 | 是按字符数的**粗略估算**，非真实账单（真测一次约 ¥0.1，以 DeepSeek 控制台为准） |
| key 来源 | 从 `AppSetting`（DB）读，不是 `os.environ` |
| 已落地范围 | 仅「方案评审专家会诊」（提交 `ec7534a` / `6bf81be`）；PPT/生图/竞品未做 |

---

## 1. 设计目标

将 Hermes MoA 2.0 的"多模型委员会机制"内嵌为 ROM-AI 的 AI 调度层，不引入完整 Hermes Agent 系统。

### 1.1 核心能力

| 能力 | 描述 |
|------|------|
| **多视角推理** | 同一任务由多个参考模型从不同专业视角并行分析 |
| **质量聚合** | 聚合模型整合参考意见，输出更高质量、更全面的结果 |
| **成本可控** | 每次 MoA 调用前有 token 预算估算，超预算拒绝 |
| **链路可追溯** | 每次多模型推理完整保存到数据基地，形成项目资产 |
| **渐进接入** | 先接入方案评审、竞品分析，再扩展至生图、PPT |

### 1.2 不做什么

- ❌ 不引入 Hermes CLI / Desktop / Gateway 等完整 Agent 系统
- ❌ 不替换 ROM-AI 现有项目中心/数据基地/共创营地架构
- ❌ 不做通用 Agent（规划、记忆、工具链全自动）
- ❌ 不做实时流式多模型输出（首期先走批量异步）

---

## 2. 数据模型

### 2.1 ProviderConfig（模型 Provider 配置）

```python
class ProviderConfig(Base):
    """LLM Provider 配置，支持多 provider（DeepSeek/OpenAI/本地等）。"""
    __tablename__ = "provider_configs"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(32), unique=True)  # "deepseek" / "openai" / "local"
    base_url: Mapped[str] = mapped_column(String(256))  # https://api.deepseek.com/v1
    api_key_env: Mapped[str] = mapped_column(String(64))  # DEEPSEEK_API_KEY
    default_model: Mapped[str] = mapped_column(String(64))  # deepseek-chat
    context_window: Mapped[int] = mapped_column(default=64000)  # 上下文窗口大小
    input_price_per_1k: Mapped[float] = mapped_column(default=0.0)  # 输入价格（元/1K tokens）
    output_price_per_1k: Mapped[float] = mapped_column(default=0.0)  # 输出价格
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

### 2.2 MoAConfig（MoA 预设配置）

```python
class MoAConfig(Base):
    """MoA 预设配置，类似 Hermes 的 preset。
    
    示例：
    - name="方案评审审核模式" → mode="review" → 3个参考模型（功能/甲方/成本）+ 1个聚合
    - name="建筑生图创作模式" → mode="creative" → 3个参考模型（构图/材质/光影）+ 1个聚合
    """
    __tablename__ = "moa_configs"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)  # 预设名称
    mode: Mapped[str] = mapped_column(String(16))  # "review" / "creative" / "decision"
    description: Mapped[str] = mapped_column(String(256), default="")
    
    # 参考模型配置（JSON 数组）
    # [{"provider_id":1, "model":"deepseek-chat", "temperature":0.3, 
    #   "system_prompt":"你是一位建筑设计功能专家...", "max_tokens":2000}]
    reference_models: Mapped[str] = mapped_column(Text, default="[]")
    
    # 聚合模型配置（JSON 对象）
    # {"provider_id":1, "model":"deepseek-reasoner", "temperature":0.2,
    #  "system_prompt":"你是评审委员会主席...", "max_tokens":4000}
    aggregator_model: Mapped[str] = mapped_column(Text, default="{}")
    
    # 控制参数
    max_references: Mapped[int] = mapped_column(default=3)  # 最多几个参考模型
    cost_limit_tokens: Mapped[int] = mapped_column(default=50000)  # 单次 MoA 总 token 上限
    cost_limit_yuan: Mapped[float] = mapped_column(default=5.0)  # 单次人民币上限
    timeout_seconds: Mapped[int] = mapped_column(default=60)  # 总超时时间
    
    # 适用技能卡
    applicable_skills: Mapped[str] = mapped_column(String(256), default="")  # "review,compete"
    
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
```

### 2.3 MoAChain（单次推理链路记录）

```python
class MoAChain(Base):
    """每次 MoA 调用的完整链路记录，沉淀到数据基地。
    
    这是"专家会诊"的完整病历：谁参与了、各自说了什么、最终结论是什么。
    """
    __tablename__ = "moa_chains"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    skill_id: Mapped[str] = mapped_column(String(32), index=True)  # "review" / "compete" / "img"
    moa_config_id: Mapped[int] = mapped_column(ForeignKey("moa_configs.id"))
    
    # 输入摘要
    input_summary: Mapped[str] = mapped_column(Text, default="")  # 输入内容摘要（脱敏）
    input_tokens: Mapped[int] = mapped_column(default=0)  # 输入 token 数
    
    # 参考模型输出（JSON 数组）
    # [{"model":"deepseek-chat","role":"功能维度","output":"...","tokens":1234,"cost_yuan":0.05,"latency_ms":1200}]
    reference_outputs: Mapped[str] = mapped_column(Text, default="[]")
    
    # 聚合模型输出
    aggregation_output: Mapped[str] = mapped_column(Text, default="")  # 最终输出文本
    aggregation_tokens: Mapped[int] = mapped_column(default=0)
    aggregation_cost: Mapped[float] = mapped_column(default=0.0)
    
    # 工具调用决策
    tool_calls_json: Mapped[str] = mapped_column(Text, default="")  # 聚合模型决定调用的工具
    final_output: Mapped[str] = mapped_column(Text, default="")  # 最终用户可见输出
    
    # 质量指标
    total_tokens: Mapped[int] = mapped_column(default=0)
    total_cost_yuan: Mapped[float] = mapped_column(default=0.0)
    total_latency_ms: Mapped[int] = mapped_column(default=0)
    human_modified: Mapped[bool] = mapped_column(default=False)  # 是否被人工修改过
    human_rating: Mapped[int] = mapped_column(default=0)  # 人工评分（1-5）
    
    # 状态
    status: Mapped[str] = mapped_column(default="running")  # running / success / failed / timeout
    error_message: Mapped[str] = mapped_column(Text, default="")
    
    created_at: Mapped[datetime]
    completed_at: Mapped[datetime] = mapped_column(nullable=True)
    
    # 关联
    moa_config: Mapped[MoAConfig] = relationship("MoAConfig")
```

### 2.4 与现有模型的关系

```
Project (1) ──→ MoAChain (N)  ──→ MoAConfig (1)
    │              │
    │              └──→ 沉淀到 KnowledgeDocument (type="moa_reasoning")
    │
    └──→ ProjectAnalysis (task="review")  ←── MoAChain 的最终输出
    └──→ SkillResult (skill_id="review")  ←── MoAChain 的调用结果
```

---

## 3. 调度流程

### 3.1 整体流程

```
┌─────────────────────────────────────────────────────────────┐
│  用户触发技能卡（如：方案评审）                                │
│  输入：项目认知 + 规划条件 + 会议纪要 + 上传文件                │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 0: 预算检查（CostGuard）                                │
│  - 估算输入 token 数                                          │
│  - 查询 MoAConfig.cost_limit_tokens / cost_limit_yuan         │
│  - 如果预估超预算 → 返回"建议改用单模型模式"或"缩减输入"       │
└─────────────────────────────────────────────────────────────┘
                             │ 通过
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 并发调用参考模型（Reference Phase）                   │
│  - 读取 MoAConfig.reference_models（3个模型配置）                │
│  - 为每个参考模型构造独立 prompt（不加载 tools schema）          │
│  - 并发调用（asyncio.gather），各自独立推理                     │
│  - 每个参考模型只输出文本分析，不调用任何工具                   │
│  - 记录：输出文本、token 数、延迟、成本                        │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 聚合模型推理（Aggregation Phase）                     │
│  - 读取 MoAConfig.aggregator_model                            │
│  - 构造聚合 prompt：                                          │
│    "以下是三位专家的分析意见，请整合并给出最终评审结论："       │
│    + [专家A: 功能维度分析]                                    │
│    + [专家B: 甲方维度分析]                                    │
│    + [专家C: 成本维度分析]                                    │
│  - 聚合模型加载 tools schema（如生成检查清单、创建任务）       │
│  - 聚合模型输出最终结论 + 决定是否调用工具                     │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 工具执行（Tool Phase，可选）                          │
│  - 如果聚合模型决定调用工具（如生成 TeamAssignment）            │
│  - 执行工具调用                                               │
│  - 将工具结果回传给聚合模型，生成最终输出                      │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 结果回写与沉淀（Persist Phase）                      │
│  - 保存 MoAChain 完整记录到数据库                             │
│  - 最终输出写入 ProjectAnalysis（task="review"）              │
│  - 保存 SkillResult（skill_id="review"）                      │
│  - 如果用户确认，可沉淀到 KnowledgeDocument（知识库）          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 并发调用细节

```python
# moa.py 核心调度逻辑（伪代码）

async def run_moa_chain(
    project_id: int,
    skill_id: str,  # "review"
    user_input: dict,  # {cognitions, files, meeting_minutes}
    moa_config: MoAConfig,
) -> MoAChain:
    
    # Step 0: 预算检查
    estimated_input_tokens = estimate_tokens(user_input)
    estimated_cost = estimate_cost(estimated_input_tokens, moa_config)
    if estimated_cost > moa_config.cost_limit_yuan:
        return MoAChain(status="failed", error_message="预估成本超预算")
    
    # Step 1: 并发调用参考模型
    reference_tasks = []
    for ref_model in moa_config.reference_models:
        prompt = build_reference_prompt(
            ref_model["system_prompt"],
            user_input,
            skill_id,
        )
        task = call_llm_async(
            provider_id=ref_model["provider_id"],
            model=ref_model["model"],
            messages=prompt,
            temperature=ref_model["temperature"],
            max_tokens=ref_model["max_tokens"],
            # 关键：不传入 tools schema
        )
        reference_tasks.append(task)
    
    reference_results = await asyncio.gather(*reference_tasks, return_exceptions=True)
    
    # Step 2: 聚合模型
    agg_prompt = build_aggregation_prompt(
        moa_config.aggregator_model["system_prompt"],
        reference_results,
        user_input,
    )
    # 关键：传入 tools schema（聚合模型可以调用工具）
    agg_result = await call_llm_async_with_tools(
        provider_id=moa_config.aggregator_model["provider_id"],
        model=moa_config.aggregator_model["model"],
        messages=agg_prompt,
        tools=SKILL_TOOLS[skill_id],  # 评审工具：生成检查清单、创建任务
    )
    
    # Step 3: 工具执行（可选）
    if agg_result.get("tool_calls"):
        tool_results = await execute_tools(agg_result["tool_calls"], project_id)
        # 工具结果回传，生成最终输出
        final_output = await call_llm_async(
            ...,
            messages=agg_prompt + [tool_results],
        )
    else:
        final_output = agg_result["content"]
    
    # Step 4: 保存链路
    chain = MoAChain(
        project_id=project_id,
        skill_id=skill_id,
        reference_outputs=serialize(reference_results),
        aggregation_output=agg_result["content"],
        final_output=final_output,
        total_cost=sum(r.cost for r in reference_results) + agg_result.cost,
        status="success",
    )
    db.add(chain); db.commit()
    
    return chain
```

### 3.3 与现有 `llm.py` 的衔接

```python
# llm.py 扩展：增加 async 版本

async def chat_completion_async(
    messages: List[dict],
    *,
    api_key: str,
    base_url: str,
    model: str,
    timeout: float = 60.0,
    response_format: Optional[dict] = None,
) -> str:
    """异步版本，用于 MoA 并发调用。"""
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, headers=headers, json=payload)
        ...

# 新增：多 provider 调度入口

def get_provider_config(provider_name: str) -> ProviderConfig:
    """从数据库读取 provider 配置。"""
    ...

async def call_llm_with_provider(
    provider_name: str,
    model: str,
    messages: List[dict],
    **kwargs,
) -> LLMResponse:
    """统一多 provider 调用入口。"""
    provider = get_provider_config(provider_name)
    api_key = os.getenv(provider.api_key_env)
    return await chat_completion_async(
        messages=messages,
        api_key=api_key,
        base_url=provider.base_url,
        model=model,
        **kwargs,
    )
```

---

## 4. 成本估算

### 4.1 模型定价假设（2026年6月参考价）

| Provider | Model | 输入价格（元/1K tokens） | 输出价格（元/1K tokens） | 上下文 |
|----------|-------|----------------------|----------------------|--------|
| DeepSeek | deepseek-chat | 0.001 | 0.002 | 64K |
| DeepSeek | deepseek-reasoner | 0.004 | 0.016 | 64K |
| OpenAI | gpt-4o | 0.036 | 0.108 | 128K |
| OpenAI | gpt-4o-mini | 0.003 | 0.012 | 128K |
| 本地/Ollama | qwen2.5-72b | 0（自有硬件） | 0 | 32K |

### 4.2 单次 MoA 调用成本估算

以**方案评审**为例（3个参考模型 + 1个聚合模型）：

| 阶段 | 模型 | 输入 tokens | 输出 tokens | 成本（元） |
|------|------|------------|------------|----------|
| 参考模型A | deepseek-chat | 8,000 | 1,500 | 0.008 + 0.003 = **0.011** |
| 参考模型B | deepseek-chat | 8,000 | 1,500 | **0.011** |
| 参考模型C | deepseek-chat | 8,000 | 1,500 | **0.011** |
| 聚合模型 | deepseek-reasoner | 12,000（含参考意见） | 3,000 | 0.048 + 0.048 = **0.096** |
| **合计** | | **36,000** | **7,500** | **0.129 元** |

对比：单模型直接调用 deepseek-reasoner（输入8K + 输出3K）= **0.072 元**

**MoA 成本溢价**：约 1.8x（但质量显著提升，且可配置轻量模型降低成本）

### 4.3 月度成本估算

假设 ROM-AI 团队 10 人，每人每月触发：
- 方案评审：20 次
- 竞品分析：10 次
- 建筑生图：15 次（MoA 只生成 prompt，生图走另一链路）
- PPT 生成：5 次

合计：50 次 MoA 调用/月

| 方案 | 单次成本 | 月成本（50次） | 年成本 |
|------|---------|-------------|--------|
| **纯 DeepSeek 方案**（3×chat + 1×reasoner） | 0.13 元 | **6.5 元** | **78 元** |
| **混合方案**（参考用 chat，聚合用 reasoner） | 0.13 元 | 6.5 元 | 78 元 |
| **OpenAI 方案**（3×4o-mini + 1×4o） | 0.72 元 | 36 元 | 432 元 |
| **本地模型方案**（参考用本地，聚合用云端） | 0.05 元 | 2.5 元 | 30 元 |

**结论**：成本极低，DeepSeek 方案下月成本不足10元，完全可接受。

### 4.4 CostGuard 策略

```python
class CostGuard:
    """成本守卫：每次 MoA 调用前检查预算。"""
    
    DAILY_BUDGET_YUAN = 10.0  # 每日预算上限
    DAILY_BUDGET_TOKENS = 500000  # 每日 token 上限
    
    @staticmethod
    def check_budget(moa_config: MoAConfig, estimated_input: int) -> tuple[bool, str]:
        """返回 (是否通过, 提示信息)。"""
        # 计算预估成本
        estimated_cost = estimate_cost(estimated_input, moa_config)
        
        # 检查单次限制
        if estimated_cost > moa_config.cost_limit_yuan:
            return False, f"预估成本 {estimated_cost:.2f} 元超过单次限制 {moa_config.cost_limit_yuan} 元"
        
        # 检查今日已用
        today_usage = get_today_usage()
        if today_usage + estimated_cost > CostGuard.DAILY_BUDGET_YUAN:
            return False, f"今日预算不足（已用 {today_usage:.2f} 元，剩余 {CostGuard.DAILY_BUDGET_YUAN - today_usage:.2f} 元）"
        
        return True, f"预估成本 {estimated_cost:.3f} 元，预算充足"
```

---

## 5. 方案评审技能卡 MoA 化设计

### 5.1 MoA 预设配置

```yaml
# MoAConfig: 方案评审审核模式
name: "方案评审审核模式"
mode: "review"
description: "三位专家分别从功能、甲方、成本维度评审方案，聚合模型整合输出检查清单"

reference_models:
  - name: "功能维度专家"
    provider_id: 1  # DeepSeek
    model: "deepseek-chat"
    temperature: 0.3
    system_prompt: |
      你是资深建筑功能设计师，专精于空间功能布局、流线组织、面积指标合规性审查。
      请基于项目材料，从以下维度给出评审意见：
      1. 功能布局合理性（动静分区、公私分区、服务与被服务空间）
      2. 空间流线效率（水平/垂直交通、疏散距离、无障碍）
      3. 面积指标符合度（容积率、建筑面积、各功能面积配比）
      4. 规范合规性（消防疏散、日照、节能、绿建）
      输出格式：逐条列出发现的问题，每条包含【问题描述】【严重程度】【建议修改方向】。
    max_tokens: 2000

  - name: "甲方维度专家"
    provider_id: 1
    model: "deepseek-chat"
    temperature: 0.3
    system_prompt: |
      你是资深甲方顾问，擅长理解开发商/政府/企业客户的真实诉求和隐性红线。
      请基于项目材料（特别是甲方诉求翻译和会议纪要），从以下维度给出评审意见：
      1. 甲方核心诉求是否被回应（投资回报、产品溢价、去化逻辑、品牌影响）
      2. 甲方隐性红线是否被触碰（成本控制、工期、政治因素、历史承诺）
      3. 汇报策略是否匹配甲方决策风格（数据驱动/经验导向/品牌优先）
      4. 方案与甲方历史项目的一贯性
      输出格式：逐条列出发现的问题，每条包含【问题描述】【严重程度】【建议修改方向】。
    max_tokens: 2000

  - name: "成本维度专家"
    provider_id: 1
    model: "deepseek-chat"
    temperature: 0.3
    system_prompt: |
      你是资深建筑造价顾问，擅长限额设计、单方造价控制和可建性评估。
      请基于项目材料，从以下维度给出评审意见：
      1. 单方造价控制（与限额设计对比）
      2. 结构体系经济性（大跨/转换层/特殊结构）
      3. 外立面/幕墙成本评估
      4. 机电设备空间与造价匹配
      5. 可建性评估（施工难度、工期影响）
      输出格式：逐条列出发现的问题，每条包含【问题描述】【严重程度】【建议修改方向】。
    max_tokens: 2000

aggregator_model:
  provider_id: 1
  model: "deepseek-reasoner"
  temperature: 0.2
  system_prompt: |
    你是方案评审委员会主席，负责整合三位专家的意见，输出最终评审报告。
    
    整合规则：
    1. 合并重复意见，标注优先级
    2. 识别冲突意见（如功能专家支持而成本专家反对），给出平衡建议
    3. 将意见分类到六类评审维度：功能匹配、多专业协调、数据支撑、日照采光、城市关系、造价控制
    4. 每项检查项标记：通过/不通过/需关注
    5. 不通过项必须给出"设计影响"和"修改建议"
    6. 输出结构化 JSON（符合 ReviewChecklist schema）
    7. 整体评分 0-100，风险等级 low/medium/high
    
    输出格式必须是严格的 JSON。
  max_tokens: 4000

cost_control:
  max_references: 3
  cost_limit_tokens: 50000
  cost_limit_yuan: 2.0
  timeout_seconds: 60

applicable_skills: "review"
```

### 5.2 输出 Schema（ReviewChecklist）

```json
{
  "project_id": 123,
  "overall_score": 78,
  "risk_level": "medium",
  "pass_rate": 0.75,
  "categories": [
    {
      "category": "function",
      "label": "功能匹配",
      "items": [
        {
          "item": "功能布局合理性",
          "pass": true,
          "note": "动静分区合理，但后勤流线与客用流线有交叉",
          "severity": "medium",
          "expert_source": "功能维度专家"
        },
        {
          "item": "空间流线效率",
          "pass": false,
          "note": "疏散距离超标，核心筒至最远点距离 38m，规范要求 30m",
          "severity": "high",
          "expert_source": "功能维度专家",
          "design_impact": "需调整核心筒位置或增加疏散楼梯",
          "suggested_action": "在平面西南角增设疏散楼梯"
        }
      ]
    }
  ],
  "conflict_items": [
    {
      "issue": "立面弧形玻璃",
      "function_view": "提升空间品质，甲方认可",
      "cost_view": "幕墙造价增加 30%，单方造价可能超标",
      "resolution": "建议采用折线玻璃替代弧形，兼顾效果与成本"
    }
  ],
  "next_steps": [
    "修改核心筒位置，确保疏散距离合规",
    "重新评估幕墙方案，控制在限额内",
    "补充无障碍设计细节"
  ]
}
```

### 5.3 前端展示（ReviewChecklistPanel）

```
┌─────────────────────────────────────────────────────────────┐
│ 方案评审报告 — 重庆启元示范区          [MoA 审核模式] [3位专家]│
├─────────────────────────────────────────────────────────────┤
│ 整体评分: 78/100  │  风险等级: 中等  │  通过率: 75%           │
├─────────────────────────────────────────────────────────────┤
│ 专家意见摘要                                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│ │ 功能维度     │ │ 甲方维度     │ │ 成本维度     │          │
│ │ 5项问题      │ │ 3项问题      │ │ 4项问题      │          │
│ │ 2项高严重    │ │ 1项高严重    │ │ 2项高严重    │          │
│ │ [查看详情]   │ │ [查看详情]   │ │ [查看详情]   │          │
│ └─────────────┘ └─────────────┘ └─────────────┘          │
├─────────────────────────────────────────────────────────────┤
│ 检查清单（6维度）                                              │
│ 功能匹配 ██████░░░░ 6/10 [展开]                              │
│ 多专业协调 ███████░░░ 7/10 [展开]                            │
│ 数据支撑 ████████░░ 8/10 [展开]                              │
│ 日照采光 ███████░░░ 7/10 [展开]                              │
│ 城市关系 ██████░░░░ 6/10 [展开]                              │
│ 造价控制 █████░░░░░ 5/10 [展开]                              │
├─────────────────────────────────────────────────────────────┤
│ 冲突意见（需平衡）                                              │
│ ⚠️ 立面弧形玻璃：功能专家支持，成本专家反对                    │
│    → 建议：采用折线玻璃替代                                    │
├─────────────────────────────────────────────────────────────┤
│ 未通过项（自动生成任务）                                       │
│ □ 疏散距离超标 → [生成任务]                                    │
│ □ 幕墙造价超标 → [生成任务]                                    │
│ □ 无障碍设计缺失 → [生成任务]                                  │
├─────────────────────────────────────────────────────────────┤
│ [确认评审结果] [重新评审] [导出报告]                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 实施路线图

| 阶段 | 任务 | 文件 | 工作量 |
|------|------|------|--------|
| **Phase 1** | 新增 ProviderConfig / MoAConfig / MoAChain 表 | `models.py` + Alembic 迁移 | S |
| **Phase 1** | `llm.py` 扩展 async + 多 provider | `llm.py` | S |
| **Phase 1** | 新增 `moa.py` 调度器（核心） | `moa.py` (~200行) | M |
| **Phase 2** | 方案评审技能卡 MoA 化 | `review_checklist.py` + `ReviewChecklistPanel` | M |
| **Phase 3** | 竞品分析技能卡 MoA 化 | `benchmark.py` + `BenchmarkPanel` | M |
| **Phase 4** | 建筑生图技能卡 MoA 化 | `img_skill.py` | M |
| **Phase 5** | 管理驾驶舱 MoA 统计 | `boss.py` + 成本/质量图表 | S |
| **Phase 6** | 数据基地回写优化 | `cross_project.py` + `KnowledgeDocument` | S |

---

## 7. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 是否 async | ✅ 是 | MoA 需要并发调用参考模型，同步会串行等待，延迟 = 3×单模型延迟 |
| 参考模型是否加载 tools | ❌ 否 | 降低成本、减少上下文污染、聚焦分析 |
| 聚合模型是否加载 tools | ✅ 是 | 负责最终决策和工具调用（生成任务、创建记录） |
| 成本估算是否精确 | ⚠️ 近似 | 用 tiktoken 估算输入，输出按 max_tokens 上限估算，留 20% 缓冲 |
| 失败是否 fallback | ✅ 是 | 任意参考模型失败，用已有结果继续；聚合失败，回退到单模型模式 |
| 是否保存完整链路 | ✅ 是 | 每次 MoA 调用保存到 MoAChain，支持审计、复盘、质量追踪 |
| 是否支持本地模型 | ✅ 是 | ProviderConfig 支持 base_url 指向本地 Ollama/vLLM，成本为零 |

---

> **文档结束。确认后进入 Phase 1 实现。**

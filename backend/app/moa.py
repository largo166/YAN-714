"""ROM-AI MoA Lite — 多模型专家委员会调度器。

核心机制：
1. 并发调用多个参考模型（不同视角），各自独立分析，不加载 tools。
2. 聚合模型整合参考意见，输出最终结论，可加载 tools。
3. 完整链路保存到 MoAChain，沉淀为项目资产。

与 llm.py 的关系：
- llm.py 提供底层单模型调用（chat_completion）。
- moa.py 在 llm.py 之上构建多模型编排层。

设计原则：
- 不引入外部 Agent 框架（Hermes/AutoGen/LangChain）。
- 纯 Python + asyncio + httpx，零额外依赖。
- 成本可控：每次调用前估算预算，超预算拒绝。
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine, Dict, List, Optional, Tuple

from .llm import LLMError, NotConfigured, chat_completion


# ═══════════════════════════════════════════════════════════════════
# 数据模型（简化版，完整版见 moa_architecture_design.md）
# ═══════════════════════════════════════════════════════════════════

@dataclass
class ProviderConfig:
    """模型 Provider 配置。"""
    name: str                           # "deepseek" / "openai"
    base_url: str
    api_key_env: str                    # 环境变量名
    default_model: str
    input_price_per_1k: float = 0.0   # 元/1K tokens
    output_price_per_1k: float = 0.0
    context_window: int = 64000


@dataclass
class ReferenceModel:
    """参考模型配置。"""
    name: str                           # "功能维度专家"
    provider: str
    model: str
    temperature: float = 0.3
    system_prompt: str = ""
    max_tokens: int = 2000


@dataclass
class AggregatorModel:
    """聚合模型配置。"""
    provider: str
    model: str
    temperature: float = 0.2
    system_prompt: str = ""
    max_tokens: int = 4000


@dataclass
class MoAConfig:
    """MoA 预设配置。"""
    name: str
    mode: str                           # "review" / "creative" / "decision"
    description: str = ""
    reference_models: List[ReferenceModel] = field(default_factory=list)
    aggregator: Optional[AggregatorModel] = None
    max_references: int = 3
    cost_limit_tokens: int = 50000
    cost_limit_yuan: float = 2.0
    timeout_seconds: int = 60
    applicable_skills: List[str] = field(default_factory=list)


@dataclass
class ReferenceOutput:
    """参考模型的输出结果。"""
    model_name: str
    role: str                           # "功能维度专家"
    output: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_yuan: float = 0.0
    latency_ms: int = 0
    status: str = "success"             # success / failed / timeout
    error: str = ""


@dataclass
class MoAResult:
    """MoA 调用最终结果。"""
    success: bool
    final_output: str = ""              # 最终用户可见输出（JSON 或文本）
    reference_outputs: List[ReferenceOutput] = field(default_factory=list)
    aggregation_output: str = ""        # 聚合模型原始输出
    total_tokens: int = 0
    total_cost_yuan: float = 0.0
    total_latency_ms: int = 0
    tool_calls: List[Dict] = field(default_factory=list)  # 聚合模型触发的工具调用
    error_message: str = ""
    chain_id: Optional[str] = None      # 链路 ID（保存后回传）


# ═══════════════════════════════════════════════════════════════════
# 内置预设：方案评审审核模式
# ═══════════════════════════════════════════════════════════════════

_REVIEW_FUNCTION_EXPERT = """你是资深建筑功能设计师，专精于空间功能布局、流线组织、面积指标合规性审查。
请基于项目材料，从以下维度给出评审意见：
1. 功能布局合理性（动静分区、公私分区、服务与被服务空间）
2. 空间流线效率（水平/垂直交通、疏散距离、无障碍）
3. 面积指标符合度（容积率、建筑面积、各功能面积配比）
4. 规范合规性（消防疏散、日照、节能、绿建）

输出格式：逐条列出发现的问题，每条包含【问题描述】【严重程度：high/medium/low】【建议修改方向】。
如果某维度没有问题，明确写"该维度无明显问题"。"""

_REVIEW_CLIENT_EXPERT = """你是资深甲方顾问，擅长理解开发商/政府/企业客户的真实诉求和隐性红线。
请基于项目材料（特别是甲方诉求和会议纪要），从以下维度给出评审意见：
1. 甲方核心诉求是否被回应（投资回报、产品溢价、去化逻辑、品牌影响）
2. 甲方隐性红线是否被触碰（成本控制、工期、政治因素、历史承诺）
3. 汇报策略是否匹配甲方决策风格（数据驱动/经验导向/品牌优先）
4. 方案与甲方历史项目的一贯性

输出格式：逐条列出发现的问题，每条包含【问题描述】【严重程度：high/medium/low】【建议修改方向】。
如果某维度没有问题，明确写"该维度无明显问题"。"""

_REVIEW_COST_EXPERT = """你是资深建筑造价顾问，擅长限额设计、单方造价控制和可建性评估。
请基于项目材料，从以下维度给出评审意见：
1. 单方造价控制（与限额设计对比）
2. 结构体系经济性（大跨/转换层/特殊结构）
3. 外立面/幕墙成本评估
4. 机电设备空间与造价匹配
5. 可建性评估（施工难度、工期影响）

输出格式：逐条列出发现的问题，每条包含【问题描述】【严重程度：high/medium/low】【建议修改方向】。
如果某维度没有问题，明确写"该维度无明显问题"。"""

_REVIEW_AGGREGATOR = """你是方案评审委员会主席，负责整合三位专家的意见，输出最终评审报告。

整合规则：
1. 合并重复意见，标注优先级
2. 识别冲突意见（如功能专家支持而成本专家反对），给出平衡建议
3. 将意见分类到六类评审维度：功能匹配、多专业协调、数据支撑、日照采光、城市关系、造价控制
4. 每项检查项标记：通过(pass)/不通过(fail)/需关注(warning)
5. 不通过项必须给出"设计影响"和"修改建议"
6. 输出必须是严格的 JSON，格式如下：

{
  "overall_score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "pass_rate": 0.0-1.0,
  "categories": [
    {
      "category": "function",
      "label": "功能匹配",
      "items": [
        {"item": "功能布局合理性", "pass": true/false, "note": "...", "severity": "high/medium/low", "expert_source": "...", "design_impact": "...", "suggested_action": "..."}
      ]
    }
  ],
  "conflict_items": [
    {"issue": "...", "function_view": "...", "cost_view": "...", "resolution": "..."}
  ],
  "next_steps": ["..."]
}

注意：
- 不要输出任何 JSON 之外的文本
- 确保 JSON 格式正确，可被 json.loads 解析
- 如果专家意见矛盾，以最终有利于项目推进的方向为优先"""


# 预设注册表
BUILTIN_MOA_PRESETS: Dict[str, MoAConfig] = {
    "review_moa": MoAConfig(
        name="方案评审审核模式",
        mode="review",
        description="三位专家分别从功能、甲方、成本维度评审方案，聚合模型整合输出检查清单",
        reference_models=[
            ReferenceModel(name="功能维度专家", provider="deepseek", model="deepseek-chat", temperature=0.3, system_prompt=_REVIEW_FUNCTION_EXPERT, max_tokens=2000),
            ReferenceModel(name="甲方维度专家", provider="deepseek", model="deepseek-chat", temperature=0.3, system_prompt=_REVIEW_CLIENT_EXPERT, max_tokens=2000),
            ReferenceModel(name="成本维度专家", provider="deepseek", model="deepseek-chat", temperature=0.3, system_prompt=_REVIEW_COST_EXPERT, max_tokens=2000),
        ],
        aggregator=AggregatorModel(provider="deepseek", model="deepseek-reasoner", temperature=0.2, system_prompt=_REVIEW_AGGREGATOR, max_tokens=4000),
        max_references=3,
        cost_limit_tokens=50000,
        cost_limit_yuan=2.0,
        timeout_seconds=60,
        applicable_skills=["review"],
    ),
}


# ═══════════════════════════════════════════════════════════════════
# Provider 管理
# ═══════════════════════════════════════════════════════════════════

# 默认 provider 配置（从环境变量读取）
DEFAULT_PROVIDERS: Dict[str, ProviderConfig] = {
    "deepseek": ProviderConfig(
        name="deepseek",
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        api_key_env="DEEPSEEK_API_KEY",
        default_model="deepseek-chat",
        input_price_per_1k=0.001,
        output_price_per_1k=0.002,
    ),
    "openai": ProviderConfig(
        name="openai",
        base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com"),
        api_key_env="OPENAI_API_KEY",
        default_model="gpt-4o",
        input_price_per_1k=0.036,
        output_price_per_1k=0.108,
    ),
}


def get_provider_config(provider_name: str) -> ProviderConfig:
    """获取 provider 配置。"""
    if provider_name not in DEFAULT_PROVIDERS:
        raise ValueError(f"未知 provider: {provider_name}")
    return DEFAULT_PROVIDERS[provider_name]


def get_api_key(provider: ProviderConfig) -> str:
    """从环境变量读取 API key。"""
    key = os.getenv(provider.api_key_env, "")
    if not key:
        raise NotConfigured(f"{provider.api_key_env} 未配置")
    return key


# ═══════════════════════════════════════════════════════════════════
# 成本估算
# ═══════════════════════════════════════════════════════════════════

def estimate_tokens(text: str) -> int:
    """粗略估算 token 数（中文 1 字 ≈ 1 token，英文 1 词 ≈ 1.3 tokens）。"""
    # 简化估算：对于中文文本，字数 ≈ token 数（误差在 ±20% 内）
    # 更精确可用 tiktoken，但不想引入额外依赖
    return len(text)


def estimate_cost(input_text: str, output_max_tokens: int, provider: ProviderConfig) -> float:
    """估算单次调用成本（元）。"""
    input_tokens = estimate_tokens(input_text)
    input_cost = (input_tokens / 1000) * provider.input_price_per_1k
    output_cost = (output_max_tokens / 1000) * provider.output_price_per_1k
    return round(input_cost + output_cost, 6)


class CostGuard:
    """成本守卫。"""
    
    DAILY_BUDGET_YUAN = 10.0
    
    @staticmethod
    def check_budget(moa_config: MoAConfig, estimated_input: str) -> Tuple[bool, str, float]:
        """检查预算。返回 (是否通过, 提示信息, 预估成本)。"""
        # 参考模型成本
        ref_cost = 0.0
        for ref in moa_config.reference_models:
            prov = get_provider_config(ref.provider)
            ref_cost += estimate_cost(estimated_input, ref.max_tokens, prov)
        
        # 聚合模型成本（输入 = 原输入 + 参考意见，按 1.5 倍估算）
        agg = moa_config.aggregator
        if agg:
            prov = get_provider_config(agg.provider)
            agg_input = estimate_tokens(estimated_input) * 1.5
            agg_cost = estimate_cost("x" * int(agg_input), agg.max_tokens, prov)
            ref_cost += agg_cost
        
        estimated = round(ref_cost, 4)
        
        if estimated > moa_config.cost_limit_yuan:
            return False, f"预估成本 {estimated} 元超过单次限制 {moa_config.cost_limit_yuan} 元", estimated
        
        return True, f"预估成本 {estimated} 元，预算充足", estimated


# ═══════════════════════════════════════════════════════════════════
# 核心调度器
# ═══════════════════════════════════════════════════════════════════

def _call_reference_sync(
    ref: ReferenceModel,
    user_input: str,
    project_context: str = "",
    api_key: str = "",
    base_url: str = "",
) -> ReferenceOutput:
    """同步调用单个参考模型。api_key/base_url 传入则用(ROM-AI 从 AppSetting 读),否则回落 env。"""
    start = time.time()
    try:
        provider = get_provider_config(ref.provider)
        key = api_key or get_api_key(provider)
        url = base_url or provider.base_url

        # 构造 prompt
        messages = [
            {"role": "system", "content": ref.system_prompt},
            {"role": "user", "content": f"【项目背景】\n{project_context}\n\n【评审材料】\n{user_input}"},
        ]

        output = chat_completion(
            messages=messages,
            api_key=key,
            base_url=url,
            model=ref.model or provider.default_model,
        )
        
        latency_ms = int((time.time() - start) * 1000)
        input_tokens = estimate_tokens(ref.system_prompt + project_context + user_input)
        output_tokens = estimate_tokens(output)
        cost = estimate_cost(ref.system_prompt + project_context + user_input, output_tokens, provider)
        
        return ReferenceOutput(
            model_name=ref.model,
            role=ref.name,
            output=output,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_yuan=cost,
            latency_ms=latency_ms,
        )
    except Exception as e:
        return ReferenceOutput(
            model_name=ref.model,
            role=ref.name,
            output="",
            status="failed",
            error=str(e),
            latency_ms=int((time.time() - start) * 1000),
        )


def _call_aggregator_sync(
    agg: AggregatorModel,
    reference_outputs: List[ReferenceOutput],
    user_input: str,
    project_context: str = "",
    response_format: Optional[Dict] = None,
    api_key: str = "",
    base_url: str = "",
) -> Tuple[str, int, float, int]:
    """同步调用聚合模型。返回 (输出, input_tokens, cost, latency_ms)。api_key/base_url 传入则用。"""
    start = time.time()
    provider = get_provider_config(agg.provider)
    key = api_key or get_api_key(provider)
    url = base_url or provider.base_url

    # 构造聚合 prompt
    ref_sections = []
    for ref in reference_outputs:
        if ref.status == "success":
            ref_sections.append(f"【{ref.role}】\n{ref.output}")
        else:
            ref_sections.append(f"【{ref.role}】\n分析失败: {ref.error}")
    
    ref_text = "\n\n---\n\n".join(ref_sections)
    
    messages = [
        {"role": "system", "content": agg.system_prompt},
        {"role": "user", "content": f"【项目背景】\n{project_context}\n\n【评审材料】\n{user_input}\n\n【专家意见】\n\n{ref_text}\n\n请整合以上意见，输出最终评审报告（JSON格式）。"},
    ]
    
    output = chat_completion(
        messages=messages,
        api_key=key,
        base_url=url,
        model=agg.model or provider.default_model,
        response_format=response_format,
    )
    
    latency_ms = int((time.time() - start) * 1000)
    input_tokens = estimate_tokens(agg.system_prompt + project_context + user_input + ref_text)
    output_tokens = estimate_tokens(output)
    cost = estimate_cost(agg.system_prompt + project_context + user_input + ref_text, output_tokens, provider)
    
    return output, input_tokens, cost, latency_ms


def run_moa_sync(
    preset_key: str,
    user_input: str,
    project_context: str = "",
    response_format: Optional[Dict] = None,
    api_key: str = "",
    base_url: str = "",
) -> MoAResult:
    """同步执行 MoA 调用（原型版）。

    Args:
        preset_key: BUILTIN_MOA_PRESETS 的 key，如 "review_moa"
        user_input: 用户输入的评审材料（文本）
        project_context: 项目背景信息（可选）
        response_format: 如 {"type": "json_object"} 强制 JSON 输出
        api_key/base_url: 传入则用（ROM-AI 从 AppSetting 读 DeepSeek key），否则回落环境变量

    Returns:
        MoAResult 包含完整链路结果
    """
    preset = BUILTIN_MOA_PRESETS.get(preset_key)
    if not preset:
        return MoAResult(success=False, error_message=f"未知 MoA 预设: {preset_key}")
    
    # Step 0: 成本检查
    passed, msg, estimated_cost = CostGuard.check_budget(preset, user_input)
    if not passed:
        return MoAResult(success=False, error_message=msg)
    
    total_start = time.time()
    
    # Step 1: 并发调用参考模型（原型用同步线程池模拟并发）
    # 生产环境应改用 asyncio.gather
    from concurrent.futures import ThreadPoolExecutor
    
    ref_outputs: List[ReferenceOutput] = []
    with ThreadPoolExecutor(max_workers=len(preset.reference_models)) as executor:
        futures = [
            executor.submit(_call_reference_sync, ref, user_input, project_context, api_key, base_url)
            for ref in preset.reference_models
        ]
        for f in futures:
            ref_outputs.append(f.result())
    
    # Step 2: 聚合模型
    if not preset.aggregator:
        return MoAResult(success=False, error_message="聚合模型未配置")
    
    agg_output, agg_input_tokens, agg_cost, agg_latency = _call_aggregator_sync(
        preset.aggregator,
        ref_outputs,
        user_input,
        project_context,
        response_format,
        api_key,
        base_url,
    )
    
    # Step 3: 解析 JSON
    final_output = agg_output
    try:
        # 尝试清理并解析 JSON
        cleaned = agg_output.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        
        # 验证 JSON 可解析
        parsed = json.loads(cleaned)
        final_output = cleaned
    except json.JSONDecodeError:
        # 解析失败，返回原始文本 + 错误标记
        final_output = json.dumps({
            "parse_error": True,
            "raw_output": agg_output,
            "error": "聚合模型输出不是有效 JSON"
        }, ensure_ascii=False)
    
    total_latency = int((time.time() - total_start) * 1000)
    total_tokens = sum(r.input_tokens + r.output_tokens for r in ref_outputs) + agg_input_tokens + estimate_tokens(agg_output)
    total_cost = sum(r.cost_yuan for r in ref_outputs) + agg_cost
    
    return MoAResult(
        success=True,
        final_output=final_output,
        reference_outputs=ref_outputs,
        aggregation_output=agg_output,
        total_tokens=total_tokens,
        total_cost_yuan=round(total_cost, 4),
        total_latency_ms=total_latency,
        chain_id=f"moa_{int(time.time() * 1000)}",
    )


# ═══════════════════════════════════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════════════════════════════════

def get_preset_for_skill(skill_id: str) -> Optional[MoAConfig]:
    """根据 skill_id 获取对应的 MoA 预设。"""
    for key, preset in BUILTIN_MOA_PRESETS.items():
        if skill_id in preset.applicable_skills:
            return preset
    return None


def format_reference_summary(outputs: List[ReferenceOutput]) -> str:
    """格式化参考模型输出摘要（用于前端展示）。"""
    lines = []
    for ref in outputs:
        icon = "✅" if ref.status == "success" else "❌"
        lines.append(f"{icon} **{ref.role}** ({ref.model_name}) — {ref.latency_ms}ms, ¥{ref.cost_yuan:.4f}")
        if ref.status == "success" and ref.output:
            # 截取前200字作为摘要
            summary = ref.output[:200].replace("\n", " ")
            lines.append(f"   摘要: {summary}...")
        elif ref.error:
            lines.append(f"   错误: {ref.error}")
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════
# 测试入口
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # 简单测试：检查预设和成本估算
    preset = BUILTIN_MOA_PRESETS["review_moa"]
    print(f"预设: {preset.name}")
    print(f"参考模型数: {len(preset.reference_models)}")
    print(f"聚合模型: {preset.aggregator.model if preset.aggregator else 'None'}")
    
    test_input = "这是一个测试输入，用于估算成本。"
    passed, msg, cost = CostGuard.check_budget(preset, test_input)
    print(f"\n预算检查: {msg}")
    print(f"预估成本: ¥{cost:.4f}")
    
    # 如果有配置 API key，可以运行完整测试
    if os.getenv("DEEPSEEK_API_KEY"):
        print("\n运行完整 MoA 测试...")
        result = run_moa_sync("review_moa", test_input, "测试项目")
        print(f"成功: {result.success}")
        print(f"总耗时: {result.total_latency_ms}ms")
        print(f"总成本: ¥{result.total_cost_yuan:.4f}")
        print(f"参考模型输出:")
        for ref in result.reference_outputs:
            print(f"  {ref.role}: {ref.status}, {ref.output[:100]}...")
    else:
        print("\nDEEPSEEK_API_KEY 未配置，跳过完整测试")

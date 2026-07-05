# MoA 专家原话沉淀设计（MoAChain / MoAExpertOutput）

> **状态**：设计稿，**待确认**。确认后才进入下一步（写迁移 `0022_moa_chains.py` + 后端双写 + 回查升级）。
> **日期**：2026-06-29
> **范围**：仅「方案评审专家会诊」的沉淀；不扩到 PPT/生图/竞品；**不做 MoAConfig**。

---

## 0. 当前事实（基线，校正旧架构文档）

- **已落地**：方案评审「专家会诊」——功能/甲方/成本三专家（`deepseek-chat`）并发 → 主审（`deepseek-reasoner`）聚合出结构化检查清单 + 跨维度冲突项。提交：`ec7534a`（最小闭环）、`6bf81be`（聚合失败兜底 + 命名收口）。
- **调度实现**：`moa.py` 用 `ThreadPoolExecutor` 并发（**不是** asyncio）；key 从 `AppSetting` 读（不是 `os.environ`）。
- **现有沉淀**：只把**聚合 JSON** 写进 `ProjectAnalysis(task="review_moa", content=聚合JSON)`。**三专家原话未持久化**。
- **成本**：`moa.py` 按字符数粗估，**非真实账单**（以 DeepSeek 控制台为准）。
- ⚠ 旧 `moa_architecture_design.md` 里「asyncio / 已建 MoAConfig·MoAChain 表 / ¥0.13」等描述与现状不符，以本文为准。

---

## 1. 为什么需要 MoAChain / MoAExpertOutput

现状缺口：回查只能看到**聚合结论**，看不到「谁说了什么」。后果：

- **可审计性不全**：甲方质疑「评审为什么没发现疏散距离问题」时，无法证明**功能专家其实提过**——三专家原话已丢。
- **统计做不了**：你要的「成本专家最常提的问题」「同一项目第一次 vs 第二次评审差异」「专家表现/失败率」全无数据支撑。

→ 需要把「**一次会诊**」（链路总记录）和「**每位专家的原话**」分别结构化落库。

---

## 2. 表结构（轻量两表，沿用 models.py 的 mapped_column 风格）

```python
class MoAChain(Base):              # 一次会诊的「病历」总记录
    __tablename__ = "moa_chains"
    id:               int   PK
    project_id:       int   FK projects CASCADE, index
    preset_key:       str(40)         # "review_moa"
    skill_id:         str(40)         # "review"（未来 PPT/img/compete 复用同表）
    status:           str(20)         # ok | aggregator_failed | error（三态如实）
    overall_score:    int   nullable  # 冗余存，免每次 parse JSON，支持按分排序/统计
    risk_level:       str(20) = ""
    pass_rate:        float nullable
    final_json:       Text            # 聚合最终 JSON（canonical）
    total_cost_yuan:  float = 0       # 估算
    total_latency_ms: int   = 0
    agg_model:        str(80)         # "deepseek-reasoner"
    source_analysis_id: int = 0       # 过渡期关联现有 ProjectAnalysis.id（0=无）
    created_at:       datetime

class MoAExpertOutput(Base):       # 每位专家的原话（N 行挂一个 chain）
    __tablename__ = "moa_expert_outputs"
    id:            int   PK
    chain_id:      int   FK moa_chains CASCADE, index
    order_index:   int                # 专家顺序 0/1/2
    role:          str(60)            # "功能维度专家"
    provider:      str(40)            # "deepseek"
    model:         str(80)            # "deepseek-chat"
    status:        str(20)            # success | failed | timeout
    output:        Text               # 专家原文（可审计）
    error:         Text  = ""
    input_tokens:  int   = 0
    output_tokens: int   = 0
    cost_yuan:     float = 0
    latency_ms:    int   = 0
    created_at:    datetime
```

---

## 3. 与现有 ProjectAnalysis 的过渡关系

- **不删** `ProjectAnalysis` 的 `review_moa` 写入：现有 `GET /api/review-checklist/{pid}` 回查依赖它，且历史数据都在那。
- `MoAChain.source_analysis_id` 关联对应 `ProjectAnalysis.id`，过渡期两边可对照。
- canonical（权威来源）逐步从 `ProjectAnalysis.content` 转到 `MoAChain.final_json`；但**不强制一次性切换**，老数据继续从 ProjectAnalysis 读。

---

## 4. 双写策略

路由 `run_review_moa` 在 `run_moa_sync` 成功后，按序：

1. **先写 `ProjectAnalysis`**（保持现状，GET 回查不破）。
2. **再写 `MoAChain`**（含冗余 `overall_score/risk_level/pass_rate` + `final_json` + 成本/延迟/状态）。
3. **批量写 N 条 `MoAExpertOutput`**（每位专家 role/model/status/output/cost/latency）。

- 三步在同一请求事务内；MoAChain/Expert 写失败**不影响已返回给前端的会诊结果**（best-effort，写失败记日志，不回滚已成功的评审）。
- **幂等**：每次会诊**新建**一条 chain（评审本就允许多次，靠 `created_at` 区分版本），不复用、不去重——这正是「两次评审对比」的数据基础。

---

## 5. 回查升级：从「只看聚合结论」→「专家原话也可回查」

- **现状**：`GET /api/review-checklist/{pid}` 读 `ProjectAnalysis.content`，只有聚合 JSON；前端 `MoaReviewPanel` 在回查态 `historyOnly=true`，隐藏专家原话，并显示「专家原话与成本未单独留存」。
- **升级后**：GET 改读最新 `MoAChain` + 其 `MoAExpertOutput`，返回 `checklist` + `reference_details`（专家原话/成本/延迟）。
- **前端**：回查态也能展开「三位专家原话」，**去掉**「未单独留存」提示。
- **兼容**：MoAChain 无记录（升级前的老数据）时**回落**读 ProjectAnalysis，仍显示聚合结论 + 保留旧提示，不报错。

---

## 6. 为什么不做 MoAConfig 表

- 预设（`review_moa` 的三专家 prompt + 主审 + 阈值）目前**固定一套**，写在 `moa.py` 的 `BUILTIN_MOA_PRESETS` 代码里。改它走代码 review，**更安全、可版本化、可回溯**。
- 做成 DB 表 = 引入「运行期可改专家 prompt/模型」的配置面，属于更后期的「**会诊模式可配置化**」需求，**现在没有真实诉求**。先不做（避免过度设计 + 少一张表的一致性维护）。
- 触发升级的真实场景：当用户/管理员要在**界面里**增删专家、换模型、调阈值时，再把 `BUILTIN_MOA_PRESETS` 升级为 `MoAConfig`。在此之前，代码即配置。

---

## 7. 不在本设计范围（确认后或后续再做）

- 迁移 `0022_moa_chains.py` 与后端双写、回查升级的**代码实现**（待本文档确认）。
- 「专家意见**采纳率**」统计（需把专家意见和最终清单项对齐，复杂，后续）。
- PPT/生图/竞品的 MoA 化。

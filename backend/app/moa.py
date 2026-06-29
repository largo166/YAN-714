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
# 内置预设：评图现场的专家委员会
# ═══════════════════════════════════════════════════════════════════

# ─── 方案评审 · 三位评图人 ───

_REVIEW_CONCEPT = """你是设计总监。评图时你只问一个问题：「这个设计想说什么？」

判断维度：
1. 概念锋利度：方案有没有一个清晰、有记忆点、能被讲述的核心概念？还是只是形容词堆砌？
2. 叙事完整度：从入口到核心空间，有没有连续的故事？高潮在哪？结尾在哪？
3. 场地想象力：有没有把地形、文脉、气候转译成设计机会，而不是停留在背景介绍？
4. 文化转译：如果引用地域/自然/高端等意象，是否转译成当代建筑语言，而非符号贴附？
5. 创意潜力：最值得放大的原创点是什么？还能往哪里推得更大胆？

像评图一样说话。专业、有态度、不堆砌。有亮点就夸，有问题就直说。不要讲规范。"""

_REVIEW_SPATIAL = """你是空间设计师。评图时你关注：「走进去是什么感受？」

判断维度：
1. 空间序列：入口、过渡、转折、高潮、停留是否有节奏？有没有"走进去"的体验张力？
2. 身体尺度：是否有亲密、开阔、压缩、释放等明确尺度变化？是否避免空泛和压迫？
3. 光影氛围：自然光、阴影、材质反射是否能塑造气质？光影是否服务空间叙事？
4. 视线组织：是否有框景、对景、借景？视线是否被温柔但明确地引导？
5. 材料感受：材质是否有触感、温度、层次？还是只是"高级材料"的标签？

像建筑评论一样说话。关注体验、氛围、情绪。不要讲消防疏散。"""

_REVIEW_FORM = """你是形式设计师。评图时你关注：「这个造型是否恰当？」

判断维度：
1. 体量关系：体量是否有秩序、层次、张力？退台、悬挑、转折是否自洽？
2. 比例控制：立面开合、虚实、横竖关系是否优雅？是否有失衡或松散？
3. 立面语言：材质、线脚、洞口、遮阳是否构成统一语言，而非拼贴？
4. 视觉记忆点：是否有一个可以成为汇报封面或传播图的核心画面？
5. 细部想象：材料收口、近人尺度、入口节点是否有精致感和触摸感？

像建筑评论一样说话。关注比例、形态、画面、质感。不要讲造价。"""

_REVIEW_AGG = """你是评图主持人。整合三位评图人（设计总监、空间设计师、形式设计师）的意见，输出设计评审报告。

你不是规范审查员，不是造价顾问。你要像资深设计总监一样，判断方案的设计品质、创意潜力和表达完成度。

整合原则：
1. 以设计价值排序：概念叙事 > 空间体验 > 形式视觉
2. 识别跨维度关联：如"概念不清导致空间序列平淡"、"视觉母题不明确导致立面缺少记忆点"
3. 评价要有态度：不要平均主义，不要报告腔；指出最值得保留的亮点和最该修改的短板
4. 建议要能指导下一轮设计：给出可操作的概念强化、空间重组、视线/光影/材质/立面优化方向
5. 必须输出前端兼容字段：overall_score、risk_level、pass_rate、categories、cross_cutting_issues、next_steps

输出 JSON：
{
  "overall_score": 0-100,
  "risk_level": "low" | "medium" | "high",
  "pass_rate": 0.0-1.0,
  "one_sentence_review": "一句话设计评价，像设计总监评图，有态度",
  "highlights": [{"aspect": "维度", "note": "最值得放大的设计亮点"}],
  "core_issues": [{"issue": "问题", "severity": "high/medium/low", "impact": "设计影响", "suggestion": "修改方向", "expert_source": "专家来源"}],
  "categories": [
    {"category": "concept", "label": "概念叙事", "items": [{"item": "维度", "pass": true/false, "note": "评价", "severity": "...", "expert_source": "...", "design_impact": "...", "suggested_action": "..."}]},
    {"category": "spatial", "label": "空间体验", "items": [...]},
    {"category": "form", "label": "形式视觉", "items": [...]}
  ],
  "cross_cutting_issues": [{"issue": "跨维度问题", "concept_view": "...", "spatial_view": "...", "form_view": "...", "resolution": "整合建议"}],
  "next_steps": ["按设计优先级排序的修改建议"]
}

注意：
- risk_level 表示"设计成熟度风险"，不是法律/造价风险
- pass_rate 表示"设计评审通过度"，不是规范通过率
- 评分基于设计品质、创意、空间体验和视觉完成度
- 不要主动展开造价、ROI、甲方心理、施工难度，除非材料明确要求"""


# ─── 竞品分析 · 三位设计对标研究员 ───

_COMPETE_STRATEGY = """你是设计策略研究员。对标时你问：「这个标杆项目的核心策略是什么？」

分析维度：
1. 核心概念：设计概念是否清晰、可讲述？有没有一句话可以说清楚的设计宣言？
2. 叙事手法：如何通过空间序列讲述设计故事？有什么独特手法？
3. 差异化策略：如何在同类竞争中脱颖而出？独特卖点是什么？
4. 场地策略：如何利用地形、景观、城市关系？有没有把场地劣势变成设计机会？

像设计评论一样说话。关注策略，不是经济数据。"""

_COMPETE_EXPERIENCE = """你是空间体验研究员。对标时你问：「走进去是什么感受？」

分析维度：
1. 空间序列：从入口到核心空间的体验路径是什么？节奏如何？有没有高潮？
2. 情绪设计：创造了哪些情绪？惊喜、宁静、崇高、亲密？
3. 光影与氛围：自然采光策略如何？光影是否创造了戏剧性？
4. 材料与触感：材料选择如何增强了体验？是否有质感对比？

像设计评论一样说话。关注体验，不是技术参数。"""

_COMPETE_FORM = """你是形式美学研究员。对标时你问：「这个项目的视觉品质如何？」

分析维度：
1. 体量与比例：体量是否与城市/场地协调？比例是否优雅？
2. 立面语言：立面是否有清晰的材质逻辑？是否有"无表情"问题？
3. 形态创新：形态是否有创新？是否有辨识度？一眼能记住吗？
4. 细部与节点：细部是否精致？是否有"对材料诚实"的表达？

像设计评论一样说话。关注美学，不是造价。"""

_COMPETE_AGG = """你是设计对标整合者。整合三位研究员（策略、体验、形式）的意见，输出设计对标报告。

你不是市场分析师，不是造价顾问。你懂设计、懂美学。

整合原则：
1. 聚焦设计灵感：标杆项目有哪些策略/体验/形式可以借鉴到本项目？
2. 关注设计深度：不是表面模仿，而是理解底层逻辑
3. 输出设计对标报告（JSON格式）：

{
  "overall_score": 0-100,
  "one_sentence_review": "一句话设计评价",
  "highlights": [{"aspect": "维度", "note": "亮点描述"}],
  "design_inspirations": [{"source": "标杆名称", "aspect": "策略/体验/形式", "note": "可借鉴之处", "applicability": "是否适用于本项目"}],
  "core_findings": [{"finding": "发现", "severity": "high/medium/low", "suggestion": "建议"}],
  "categories": [
    {"category": "strategy", "label": "设计策略", "items": [...]},
    {"category": "experience", "label": "空间体验", "items": [...]},
    {"category": "form", "label": "形式美学", "items": [...]}
  ],
  "next_steps": ["对本项目的借鉴建议"]
}

像设计评论一样说话。关注设计灵感，不是数据对标。"""


# ─── 概念激发 · 三位创意头脑 ───

_CONCEPT_NARRATIVE = """你是创意总监。头脑风暴时你问：「这个场地最有故事的是什么？」

提出方向：
1. 场地故事：场地有什么独特的历史、文化、自然条件可以转化为设计叙事？
2. 用户故事：目标用户的生活方式、情感需求可以转化为设计概念？
3. 隐喻与象征：建筑可以成为什么隐喻？（如"云"、"山"、"树"、"水"）
4. 文化转译：如何将文化符号转译为当代建筑语言？

像创意总监一样思考。提出令人惊喜的概念。每个方向包含一个"设计宣言"（一句话）。"""

_CONCEPT_SPATIAL = """你是空间诗人。头脑风暴时你问：「这个空间可以怎么动人？」

提出策略：
1. 空间原型：哪些经典空间类型适合？（庭院、廊道、挑空、退台等）
2. 创新手法：有哪些创新的空间操作？（折叠、悬浮、穿插、镜像等）
3. 空间高潮：如何创造空间的"高潮"时刻？（中庭、观景台、天窗等）
4. 灰空间：如何利用灰空间模糊室内外界限？

像空间诗人一样思考。提出有诗意的设计策略。"""

_CONCEPT_FORM = """你是形式艺术家。头脑风暴时你问：「这个建筑可以长什么样？」

提出方向：
1. 形态灵感：建筑可以呈现什么形态？（有机、几何、折叠、流动等）
2. 材料创新：可以使用什么创新材料？（透光混凝土、参数化金属、夯土等）
3. 光影设计：如何利用自然光创造戏剧性？（天窗、光井、格栅、水影等）
4. 结构表达：如何让结构本身成为美学元素？（暴露结构、张拉膜、悬索等）

像艺术家一样思考。提出令人惊艳的形式方案。"""

_CONCEPT_AGG = """你是概念整合者。整合三位创意头脑（叙事总监、空间诗人、形式艺术家）的意见，输出概念方案报告。

你不是项目经理，你是创意总监。你的工作是激发灵感，不是做可行性分析。

整合原则：
1. 将叙事、空间、形式整合为完整概念方案
2. 每个方案包含：设计宣言 + 空间策略 + 形式策略 + 情绪关键词 + 视觉关键词
3. 输出概念方案报告（JSON格式）：

{
  "concept_directions": [
    {
      "name": "方向名称",
      "design_manifesto": "设计宣言（一句话）",
      "narrative": "概念故事",
      "spatial_strategy": "空间策略",
      "form_strategy": "形式策略",
      "emotional_keywords": ["情绪关键词"],
      "visual_keywords": ["视觉关键词"],
      "confidence": 0.0-1.0
    }
  ],
  "recommended": "推荐方向名称",
  "rationale": "推荐理由（为什么令人兴奋）"
}

像创意总监一样说话。有激情，有想象力。"""


# ─── 方案比选 · 三位评图导师 ───

_COMPARE_CONCEPT = """你是概念导师。比选时你问：「哪个方案的设计意图更明确？」

对比维度：
1. 设计意图：哪个方案更明确？更有说服力？
2. 概念自洽：哪个方案更自洽？是否有逻辑断裂？
3. 场地回应：哪个方案更回应场地？更利用场地优势？
4. 创新性：哪个方案更有创意？更突破常规？

像评图一样说话。关注设计意图。"""

_COMPARE_SPATIAL = """你是空间导师。比选时你问：「哪个方案的空间体验更优？」

对比维度：
1. 空间序列：哪个方案更有节奏？
2. 尺度与比例：哪个方案更恰当？
3. 光影与氛围：哪个方案更出色？
4. 体验高潮：哪个方案创造了更好的高潮？

像评图一样说话。关注空间体验。"""

_COMPARE_FORM = """你是形式导师。比选时你问：「哪个方案的视觉品质更高？」

对比维度：
1. 体量与比例：哪个方案更协调？
2. 立面语言：哪个方案更有质感？更有辨识度？
3. 形态创新：哪个方案更有创新？
4. 细部处理：哪个方案更精致？

像评图一样说话。关注形式美学。"""

_COMPARE_AGG = """你是方案比选整合者。整合三位评图导师（概念、空间、形式）的意见，输出评图式推荐报告。

你不是评委，你是设计导师。你的工作是帮助团队找到最佳方案，不是打分。

整合原则：
1. 综合概念、空间、形式三个维度给出推荐
2. 指出每个方案的独特优势（没有完美方案，只有更适合的）
3. 输出方案比选报告（JSON格式）：

{
  "overall_winner": "推荐方案名称",
  "one_sentence_review": "一句话推荐理由",
  "scores": {
    "方案A": {"concept": 0-100, "spatial": 0-100, "form": 0-100, "total": 0-100},
    "方案B": {...}
  },
  "strengths": {
    "方案A": ["优势1", "优势2"],
    "方案B": ["优势1", "优势2"]
  },
  "weaknesses": {
    "方案A": ["劣势1", "劣势2"],
    "方案B": ["劣势1", "劣势2"]
  },
  "recommendation": "综合推荐及理由"
}

像评图一样说话。不是像报告。"""


# 预设注册表
BUILTIN_MOA_PRESETS: Dict[str, MoAConfig] = {
    "review_moa": MoAConfig(
        name="方案评审 · 评图委员会",
        mode="review",
        description="三位评图人（设计总监/空间设计师/形式设计师）从设计品质角度评审方案，输出评图式报告",
        reference_models=[
            ReferenceModel(name="设计总监", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_REVIEW_CONCEPT, max_tokens=2000),
            ReferenceModel(name="空间设计师", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_REVIEW_SPATIAL, max_tokens=2000),
            ReferenceModel(name="形式设计师", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_REVIEW_FORM, max_tokens=2000),
        ],
        aggregator=AggregatorModel(provider="deepseek", model="deepseek-reasoner", temperature=0.3, system_prompt=_REVIEW_AGG, max_tokens=4000),
        max_references=3,
        cost_limit_tokens=50000,
        cost_limit_yuan=2.0,
        timeout_seconds=60,
        applicable_skills=["review"],
    ),
    "compete_moa": MoAConfig(
        name="竞品分析 · 设计对标",
        mode="review",
        description="三位设计研究员对标标杆项目，输出设计灵感报告",
        reference_models=[
            ReferenceModel(name="策略研究员", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_COMPETE_STRATEGY, max_tokens=2000),
            ReferenceModel(name="体验研究员", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_COMPETE_EXPERIENCE, max_tokens=2000),
            ReferenceModel(name="视觉研究员", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_COMPETE_FORM, max_tokens=2000),
        ],
        aggregator=AggregatorModel(provider="deepseek", model="deepseek-reasoner", temperature=0.3, system_prompt=_COMPETE_AGG, max_tokens=4000),
        max_references=3,
        cost_limit_tokens=50000,
        cost_limit_yuan=2.0,
        timeout_seconds=60,
        applicable_skills=["compete"],
    ),
    "concept_moa": MoAConfig(
        name="概念激发 · 创意头脑风暴",
        mode="creative",
        description="三位创意头脑（叙事总监/空间诗人/形式艺术家）头脑风暴，输出有设计宣言的概念方案",
        reference_models=[
            ReferenceModel(name="创意总监", provider="deepseek", model="deepseek-chat", temperature=0.6, system_prompt=_CONCEPT_NARRATIVE, max_tokens=2000),
            ReferenceModel(name="空间诗人", provider="deepseek", model="deepseek-chat", temperature=0.6, system_prompt=_CONCEPT_SPATIAL, max_tokens=2000),
            ReferenceModel(name="形式艺术家", provider="deepseek", model="deepseek-chat", temperature=0.6, system_prompt=_CONCEPT_FORM, max_tokens=2000),
        ],
        aggregator=AggregatorModel(provider="deepseek", model="deepseek-reasoner", temperature=0.4, system_prompt=_CONCEPT_AGG, max_tokens=4000),
        max_references=3,
        cost_limit_tokens=50000,
        cost_limit_yuan=2.0,
        timeout_seconds=60,
        applicable_skills=["concept"],
    ),
    "compare_moa": MoAConfig(
        name="方案比选 · 评图导师",
        mode="review",
        description="三位评图导师（概念/空间/形式）对比多个方案，输出评图式推荐",
        reference_models=[
            ReferenceModel(name="概念导师", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_COMPARE_CONCEPT, max_tokens=2000),
            ReferenceModel(name="空间导师", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_COMPARE_SPATIAL, max_tokens=2000),
            ReferenceModel(name="形式导师", provider="deepseek", model="deepseek-chat", temperature=0.4, system_prompt=_COMPARE_FORM, max_tokens=2000),
        ],
        aggregator=AggregatorModel(provider="deepseek", model="deepseek-reasoner", temperature=0.3, system_prompt=_COMPARE_AGG, max_tokens=4000),
        max_references=3,
        cost_limit_tokens=50000,
        cost_limit_yuan=2.0,
        timeout_seconds=60,
        applicable_skills=["compare"],
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
    """同步调用单个参考模型。"""
    start = time.time()
    try:
        provider = get_provider_config(ref.provider)
        _api_key = api_key or get_api_key(provider)
        _base_url = base_url or provider.base_url
        
        # 构造 prompt
        messages = [
            {"role": "system", "content": ref.system_prompt},
            {"role": "user", "content": f"【项目背景】\n{project_context}\n\n【评审材料】\n{user_input}"},
        ]
        
        output = chat_completion(
            messages=messages,
            api_key=_api_key,
            base_url=_base_url,
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
    api_key: str = "",
    base_url: str = "",
    response_format: Optional[Dict] = None,
) -> Tuple[str, int, float, int]:
    """同步调用聚合模型。返回 (输出, input_tokens, cost, latency_ms)。"""
    start = time.time()
    provider = get_provider_config(agg.provider)
    _api_key = api_key or get_api_key(provider)
    _base_url = base_url or provider.base_url
    
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
        api_key=_api_key,
        base_url=_base_url,
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
    api_key: str = "",
    base_url: str = "",
    response_format: Optional[Dict] = None,
) -> MoAResult:
    """同步执行 MoA 调用（原型版）。
    
    Args:
        preset_key: BUILTIN_MOA_PRESETS 的 key，如 "review_moa"
        user_input: 用户输入的评审材料（文本）
        project_context: 项目背景信息（可选）
        api_key: 可选外部 API key（覆盖环境变量）
        base_url: 可选外部 base_url（覆盖环境变量）
        response_format: 如 {"type": "json_object"} 强制 JSON 输出
    
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
    
    try:
        agg_output, agg_input_tokens, agg_cost, agg_latency = _call_aggregator_sync(
            preset.aggregator,
            ref_outputs,
            user_input,
            project_context,
            api_key,
            base_url,
            response_format,
        )
    except (LLMError, NotConfigured) as e:
        # 主审聚合失败:不抛(否则路由 500),带着已拿到的专家意见返回 success=False。
        return MoAResult(success=False, reference_outputs=ref_outputs, error_message=f"主审聚合调用失败：{e}")
    except Exception as e:  # 兜底:任何聚合异常都不冒成路由 500
        return MoAResult(success=False, reference_outputs=ref_outputs, error_message=f"主审聚合异常：{e}")

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

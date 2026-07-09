"""会议转写热词 · initial_prompt 构造(2026-07-09,认知资产复利)。

把「默认建筑术语表 + 本项目名/甲方/城市 + 已确认认知词条」拼成 faster-whisper 的
initial_prompt——建筑专业词转不准是通用工具的通病,认知脊椎直接变现是垂类差异点。

纯函数,零 IO(认知词条由调用方经 analysis.gather_cognition 传入,保持脊椎单一注入点)。
不伪造:认知只取已确认(gather_cognition 已过滤 status=confirmed);无项目信号则只回默认表。
"""
from __future__ import annotations

import re

# 负责人给定的默认建筑术语表(2026-07-09 已批)。后续允许项目级扩展,不覆盖此基线。
DEFAULT_TERMS: tuple[str, ...] = (
    # 项目名/甲方(高频专有名词,whisper 最易转错的一类)
    "市庄", "琅悦", "中艺", "江帆序", "保利",
    # 展示区/场地
    "展示区", "示范区", "归家动线", "下沉庭院", "公共绿地", "配套",
    # 总图/建筑
    "总图", "户型", "立面", "抬板", "架空层", "会所", "庭院", "连桥",
    # 风格/形制
    "宋式", "北方庄院", "高台府门",
    # 经济/报建
    "货值", "溢价", "报规", "强排", "竖向", "消防", "日照", "面宽", "进深",
)

_TERM_RE = re.compile(r"[，,。;；、\s]+")


def _split_terms(text: str) -> list[str]:
    """从认知词条值里切出可能的专有名词(短词优先——长句对 initial_prompt 无益)。"""
    if not text:
        return []
    parts = [p.strip() for p in _TERM_RE.split(text) if p.strip()]
    # 只留 ≤8 字的短词(项目名/地名/术语),滤掉整句描述
    return [p for p in parts if 0 < len(p) <= 8]


def build_hotwords(
    project_name: str = "",
    city: str = "",
    client: str = "",
    cognition_terms: list[str] | None = None,
    extra: list[str] | None = None,
) -> list[str]:
    """构造去重有序的热词表:默认术语 + 项目专有名词 + 认知词条 + 项目级扩展。

    顺序=优先级(默认基线在前,项目特异在后);去重保序。
    """
    ordered: list[str] = list(DEFAULT_TERMS)
    for name in (project_name, city, client):
        ordered.extend(_split_terms(name))
    for term in cognition_terms or []:
        ordered.extend(_split_terms(term))
    ordered.extend(extra or [])

    seen: set[str] = set()
    uniq: list[str] = []
    for t in ordered:
        t = t.strip()
        if t and t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def to_initial_prompt(hotwords: list[str]) -> str:
    """热词表 → whisper initial_prompt 文本(顿号分隔的词表,引导模型偏向这些拼写)。"""
    if not hotwords:
        return ""
    # faster-whisper initial_prompt 是一段"前文"文本;列词表让模型倾向这些专业写法。
    return "本次会议涉及建筑设计专业术语:" + "、".join(hotwords) + "。"

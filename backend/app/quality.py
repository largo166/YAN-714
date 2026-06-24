"""隐形质检层（阶段6）：自动扫描结构化认知的【防假认知】违规,产出 advisory 警告。

"隐形"=随认知输出自动计算、作为咨询性警告呈现,不阻断操作（人定即权威）。
它是防假认知红线(纲要规则3/4)的数据完整性安全网,捕捉这些可疑形态：
- confirmed 字段却空值（已确认但无内容,语义矛盾）
- low/manual_only 字段被标 confirmed 但来源不是 manual（判断/核心立场应人工审定,非 AI 直接确认）
- source.type=doc 却无 doc_ids（自称有原文出处但拿不出文档）
- manual_only 字段已填值却仍 status=empty（状态与内容不一致）
- 字段值含嵌套空壳（[None] / ['  '] 之类占位）

只读、纯函数,无副作用。
"""
from __future__ import annotations

from typing import List

from . import analysis


def _nonempty(v) -> bool:
    return analysis.is_nonempty(v)


def audit_fields(fields: list) -> List[dict]:
    """扫描字段记录数组,返回警告列表。每条 {field, level, code, message}。"""
    warnings: List[dict] = []
    if not isinstance(fields, list):
        return warnings
    for f in fields:
        if not isinstance(f, dict):
            continue
        key = f.get("key", "?")
        label = f.get("label", key)
        status = f.get("status")
        ex = f.get("extractable")
        val = f.get("value")
        src = f.get("source") or {}
        src_type = src.get("type")

        # 1) confirmed 却空值
        if status == "confirmed" and not _nonempty(val):
            warnings.append({"field": key, "level": "high", "code": "confirmed_empty",
                             "message": f"「{label}」已确认却无实质内容（已确认但空值,语义矛盾）"})
        # 2) 值含嵌套空壳（list 逐项 / dict 逐值 都查——object 型字段如 key_indicators 也覆盖）
        if _nonempty(val):
            items = list(val) if isinstance(val, (list, tuple)) else (
                list(val.values()) if isinstance(val, dict) else [])
            if items and any(not _nonempty(x) for x in items):
                warnings.append({"field": key, "level": "medium", "code": "nested_empty",
                                 "message": f"「{label}」值含空壳项（如 None/空白）,建议清理"})
        # 3) low/manual_only 被 confirmed 但来源非 manual（应人工审定,非 AI 直接确认）
        if status == "confirmed" and ex in ("low", "manual_only") and src_type != "manual":
            warnings.append({"field": key, "level": "medium", "code": "judgment_not_manual",
                             "message": f"「{label}」是判断/核心立场,已确认但来源非人工（应人工审定）"})
        # 4) 自称 doc 出处却无 doc_ids
        if src_type == "doc" and not (src.get("doc_ids") or []):
            warnings.append({"field": key, "level": "low", "code": "doc_without_ids",
                             "message": f"「{label}」标注原文出处却无具体文档引用"})
        # 5) manual_only 已填值却仍 empty
        if ex == "manual_only" and _nonempty(val) and status == "empty":
            warnings.append({"field": key, "level": "medium", "code": "manual_value_but_empty_status",
                             "message": f"「{label}」已填值但状态仍为待填（状态与内容不一致）"})
    return warnings

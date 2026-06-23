"""JSON 字段统一安全解析（P1 红线：杜绝一条脏数据崩页面）。

用于 TEXT 列里存的 JSON（如后续 ProjectAnalysis.sources / 各类 *_json 列）：
读取时统一安全解析，失败回退默认值而非抛异常崩页面；写入前校验可序列化。
"""
from __future__ import annotations

import json
from typing import Any


def loads_or(text: Any, default: Any) -> Any:
    """安全解析 JSON 文本；None/空/非法 → 返回 default（绝不抛）。"""
    if text is None:
        return default
    if not isinstance(text, str):
        # 已是 dict/list 等，原样返回
        return text
    s = text.strip()
    if not s:
        return default
    try:
        return json.loads(s)
    except (ValueError, TypeError):
        return default


def dumps_safe(obj: Any, *, default: str = "[]") -> str:
    """序列化为 JSON 文本；不可序列化 → 返回 default（绝不抛）。"""
    try:
        return json.dumps(obj, ensure_ascii=False)
    except (TypeError, ValueError):
        return default

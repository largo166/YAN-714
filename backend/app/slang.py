"""甲方诉求翻译器（4E）。

种子词典：term=原话, meaning=真实含义, impact=设计影响, action=建议动作。
能力：加载 / 关键词查询（精确+模糊） / 供会议诉求转译 prompt 注入。
"""
from __future__ import annotations

import json
import pathlib
from typing import List, Optional

_DICT_PATH = pathlib.Path(__file__).parent / "assets" / "slang_dict.json"


def load_entries() -> List[dict]:
    try:
        d = json.loads(_DICT_PATH.read_text(encoding="utf-8"))
        return d.get("entries", [])
    except (OSError, ValueError):
        return []


def query(keyword: str, *, limit: int = 10) -> List[dict]:
    """按关键词查诉求翻译条目（term/meaning/impact 任一包含即命中）。"""
    k = (keyword or "").strip()
    if not k:
        return load_entries()[:limit]
    hits = []
    for e in load_entries():
        blob = f"{e.get('term','')}{e.get('meaning','')}{e.get('impact','')}{e.get('action','')}"
        if k in blob:
            hits.append(e)
        if len(hits) >= limit:
            break
    return hits


def prompt_hint(max_terms: int = 40) -> str:
    """供会议诉求转译注入的词典提示。"""
    entries = load_entries()[:max_terms]
    if not entries:
        return ""
    lines = ["甲方诉求翻译参考词典（识别表层话术背后的真实诉求，输出含义/影响/动作）："]
    for e in entries:
        lines.append(
            f"- 「{e.get('term','')}」→ 含义:{e.get('meaning','')}；影响:{e.get('impact','')}；动作:{e.get('action','')}"
        )
    return "\n".join(lines)

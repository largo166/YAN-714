"""会议五段式纪要生成（会议模块）。

五段：会议纪要 / 核心事项 / 甲方诉求转译 / 决议 / 待办。
红线落地：
- 诉求转译分『对内研判版』与『对外纪要版』两套（demand_internal / demand_external），分离存储。
- 每条诉求锚定转写原话(quote)+时间点(time)。
- 种子黑话词典注入 prompt 辅助转译。
- AI 出草案（review_status=draft），人工审定后置 confirmed。
- 三态：未配 key→not_configured；空转写→no_material；都不伪造（由路由层组合 LLM 调用）。

LLM 要求输出严格 JSON；解析失败用 safe_json 容错，不崩页面。
"""
from __future__ import annotations

import json
import pathlib
from typing import List, Optional

from . import safe_json

_DICT_PATH = pathlib.Path(__file__).parent / "assets" / "slang_dict.json"
_FIVE_SECTIONS = ("会议背景", "关键结论", "甲方诉求", "风险与分歧", "下一步行动")


def load_slang_dict() -> List[dict]:
    from . import slang
    return slang.load_entries()


def _slang_hint(max_terms: int = 40) -> str:
    from . import slang
    return slang.prompt_hint(max_terms)


def build_prompt(title: str, segments: List[dict]) -> List[dict]:
    """组装五段式生成的 LLM messages。segments=[{text,speaker_key,start_ms,end_ms}]。

    五段语义：会议背景 / 关键结论 / 甲方诉求(翻译) / 风险与分歧 / 下一步行动。
    字段名沿用 summary/core_items/demand_*/decisions/todos（schema 稳定）。
    """
    lines = []
    for s in segments:
        t = _fmt_time(s.get("start_ms", 0))
        spk = s.get("speaker_key", "")
        lines.append(f"[{t}] {spk}: {s.get('text','')}")
    transcript = "\n".join(lines)

    slang = _slang_hint()
    sys_parts = [
        "你是资深建筑设计项目助理，把会议记录整理为五段式纪要：会议背景、关键结论、甲方诉求、风险与分歧、下一步行动。",
        slang,
        "甲方诉求必须做诉求翻译，且区分两版：",
        "- demand_internal（对内研判版）：点破甲方真实意图、潜台词、隐藏顾虑与策略建议，供团队内部判断。",
        "- demand_external（对外纪要版）：措辞得体、可直接给甲方的中性表述。",
        "每条诉求给出 quote（锚定原话片段）与 time（mm:ss）。",
        "严格输出 JSON，不要额外解释。",
    ]
    schema_hint = (
        '输出 JSON：{"summary":[会议背景要点...],'
        '"core_items":[关键结论...],'
        '"demand_internal":[{"statement":"","quote":"","time":""}...],'
        '"demand_external":[{"statement":"","quote":"","time":""}...],'
        '"decisions":[风险与分歧条目...],'
        '"todos":[{"text":"","owner":"","due":""}...（下一步行动）]}'
    )
    user = f"会议标题：{title}\n\n会议记录（带时间点）：\n{transcript}\n\n{schema_hint}"
    return [
        {"role": "system", "content": "\n".join(p for p in sys_parts if p)},
        {"role": "user", "content": user},
    ]


def parse_minute(answer: str) -> dict:
    """解析 LLM 返回的五段 JSON（容错）。返回规整后的 dict。"""
    data = safe_json.loads_or(_strip_fence(answer), {})
    if not isinstance(data, dict):
        data = {}
    return {
        "summary": _as_str_list(data.get("summary")),
        "core_items": _as_str_list(data.get("core_items")),
        "demand_internal": _as_demand_list(data.get("demand_internal")),
        "demand_external": _as_demand_list(data.get("demand_external")),
        "decisions": _as_str_list(data.get("decisions")),
        "todos": _as_todo_list(data.get("todos")),
    }


def render_markdown(title: str, m: dict, *, review_status: str = "draft", external_only: bool = True) -> str:
    """导出 Markdown。external_only=True 仅含对外纪要版诉求（对外发布默认）。"""
    out = [f"# 会议纪要 · {title}", "", f"> 审定状态：{review_status}", ""]
    out += ["## 一、会议背景"] + [f"- {x}" for x in m.get("summary", [])] + [""]
    out += ["## 二、关键结论"] + [f"- {x}" for x in m.get("core_items", [])] + [""]
    out.append("## 三、甲方诉求")
    demands = m.get("demand_external", []) if external_only else m.get("demand_internal", [])
    for d in demands:
        out.append(f"- {d.get('statement','')}（原话：「{d.get('quote','')}」 {d.get('time','')}）")
    if not external_only and m.get("demand_internal"):
        out.append("")
        out.append("### （对内研判，不对外）")
        for d in m.get("demand_internal", []):
            out.append(f"- {d.get('statement','')}（原话：「{d.get('quote','')}」 {d.get('time','')}）")
    out.append("")
    out += ["## 四、风险与分歧"] + [f"- {x}" for x in m.get("decisions", [])] + [""]
    out.append("## 五、下一步行动")
    for t in m.get("todos", []):
        owner = f" @{t.get('owner','')}" if t.get("owner") else ""
        due = f"（{t.get('due','')}）" if t.get("due") else ""
        out.append(f"- [ ] {t.get('text','')}{owner}{due}")
    return "\n".join(out)


# ── helpers ──
def _fmt_time(ms) -> str:
    try:
        s = int(ms) // 1000
    except (TypeError, ValueError):
        s = 0
    return f"{s // 60:02d}:{s % 60:02d}"


def _strip_fence(text: str) -> str:
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


def _as_str_list(v) -> List[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    return []


def _as_demand_list(v) -> List[dict]:
    out = []
    if isinstance(v, list):
        for it in v:
            if isinstance(it, dict):
                out.append({
                    "statement": str(it.get("statement", "")).strip(),
                    "quote": str(it.get("quote", "")).strip(),
                    "time": str(it.get("time", "")).strip(),
                })
            elif str(it).strip():
                out.append({"statement": str(it).strip(), "quote": "", "time": ""})
    return out


def _as_todo_list(v) -> List[dict]:
    out = []
    if isinstance(v, list):
        for it in v:
            if isinstance(it, dict):
                out.append({
                    "text": str(it.get("text", "")).strip(),
                    "owner": str(it.get("owner", "")).strip(),
                    "due": str(it.get("due", "")).strip(),
                })
            elif str(it).strip():
                out.append({"text": str(it).strip(), "owner": "", "due": ""})
    return out

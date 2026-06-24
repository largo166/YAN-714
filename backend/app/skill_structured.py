"""PPT 大纲 / 会议纪要 结构化生成(吸收自可移植技能卡分享包 core/prompts.ts + normalizers.ts)。

约定:
- build_*_prompt() 产出 (system, user, response_format) 给 DeepSeek json mode。
- normalize_*() 把模型 JSON 兜底成稳定结构(PPT 强制 N 页、占位页、字段缺省),不崩。
- *_to_markdown() 渲染成 markdown 作 SkillRunOut.content(向后兼容成果卡纯文本渲染)。
不伪造:兜底只补占位/缺省,不编造事实;占位页明确标「需人工补充」。
"""
from __future__ import annotations

import json
import re
from typing import Any

JSON_FORMAT = {"type": "json_object"}


# ── 工具 ──
def _rec(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def _text(v: Any, fallback: str = "") -> str:
    s = str(v).strip() if v is not None else ""
    return s or fallback


def _list(v: Any) -> list:
    return v if isinstance(v, list) else []


def _strlist(v: Any) -> list[str]:
    return [_text(x) for x in _list(v) if _text(x)]


def _num(v: Any):
    try:
        n = float(v)
        return max(0, int(n)) if n == int(n) else max(0, n)
    except (TypeError, ValueError):
        return None


def parse_json_loose(raw: str) -> dict:
    """从模型输出里尽量解析出 JSON(json mode 通常直接是 JSON;兜底剥代码围栏/取最外层花括号)。"""
    t = (raw or "").strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[t.find("{"):] if "{" in t else t
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        a, b = t.find("{"), t.rfind("}")
        if a >= 0 and b > a:
            try:
                return json.loads(t[a : b + 1])
            except json.JSONDecodeError:
                return {}
        return {}


def slide_count_from_input(user_input: str, default: int = 12) -> int:
    """从用户补充里抓「X页」覆盖默认页数;范围收口 3-40。"""
    m = re.search(r"(\d{1,2})\s*页", user_input or "")
    n = int(m.group(1)) if m else default
    return min(40, max(3, n))


# ── PPT 大纲 ──
_PPT_SCHEMA = (
    '{\n'
    '  "title": "PPT 标题",\n'
    '  "subtitle": "副标题",\n'
    '  "audience": "汇报对象",\n'
    '  "narrative": "整份汇报叙事主线2-4句;资料不足也在此说明",\n'
    '  "slides": [\n'
    '    {"no":1,"title":"页标题","purpose":"本页结构作用","keyMessage":"一句话结论",'
    '"bullets":["3-5条短句要点"],"visualSuggestion":"建议图/版式","speakerNotes":"讲稿提示1-3句",'
    '"sourceRefs":["项目名/知识库标题/出处"]}\n'
    '  ]\n'
    '}'
)


def build_ppt_prompt(project_name: str, material_context: str, user_input: str, slide_count: int):
    system = (
        "你是资深方案汇报策划总监,把项目资料与知识库整理成可直接发给甲方的 PPT 大纲。"
        "必须严格按页数输出结构化结果。只输出合法 JSON,不输出 markdown,不编造资料中没有的事实。"
    )
    user = "\n".join(
        [
            f"请基于项目数据与知识库资料,生成一份逻辑清晰、可直接汇报的 PPT 大纲。",
            "",
            "输出 JSON 结构必须为:",
            _PPT_SCHEMA,
            "",
            "硬性要求:",
            f"- slides 数量必须严格等于 {slide_count},不能多不能少,按 1..{slide_count} 连续编号。",
            "- 每页都要有 title/purpose/keyMessage/bullets/visualSuggestion/speakerNotes/sourceRefs。",
            "- bullets 每页 3-5 条结构化短句,不写散文段落;每页只表达一个核心信息。",
            "- sourceRefs 只能引用下方出现过的项目名/知识库标题。资料不足就在该页 speakerNotes 标「需人工补充」,不编造。",
            "",
            f"项目:{project_name}",
            f"目标页数:{slide_count}",
            (f"用户补充:{user_input.strip()}" if user_input.strip() else ""),
            "",
            "项目数据与知识库资料:",
            (material_context or "(无可用材料,请基于项目名给出通用框架,并在 narrative 注明缺资料)"),
        ]
    )
    return system, user, JSON_FORMAT


def _norm_slide(item: Any, idx: int) -> dict:
    s = _rec(item)
    return {
        "no": idx + 1,
        "title": _text(s.get("title"), f"第 {idx + 1} 页"),
        "purpose": _text(s.get("purpose"), "说明本页在汇报结构中的作用"),
        "keyMessage": _text(s.get("keyMessage") or s.get("key_message"), "需人工补充核心观点"),
        "bullets": _strlist(s.get("bullets"))[:8],
        "visualSuggestion": _text(s.get("visualSuggestion") or s.get("visual_suggestion"), "补充建议图示或版式"),
        "speakerNotes": _text(s.get("speakerNotes") or s.get("speaker_notes"), "补充讲稿提示"),
        "sourceRefs": _strlist(s.get("sourceRefs") or s.get("source_refs"))[:8],
    }


def _placeholder_slide(idx: int) -> dict:
    return {
        "no": idx + 1,
        "title": "需人工补充",
        "purpose": "模型未返回这一页,已按目标页数补齐占位。",
        "keyMessage": "需人工补充核心观点。",
        "bullets": ["补充本页要点", "补充支撑事实", "补充结论表达"],
        "visualSuggestion": "补充页面版式或图表建议。",
        "speakerNotes": "请结合项目资料人工复核并补充。",
        "sourceRefs": [],
    }


def normalize_ppt(value: dict, slide_count: int) -> dict:
    raw = _rec(value)
    slides = [_norm_slide(x, i) for i, x in enumerate(_list(raw.get("slides")))][:slide_count]
    for i in range(len(slides), slide_count):  # 少页补占位,杜绝静默少页
        slides.append(_placeholder_slide(i))
    for i, s in enumerate(slides):
        s["no"] = i + 1
    return {
        "title": _text(raw.get("title"), "PPT 大纲"),
        "subtitle": _text(raw.get("subtitle"), "基于项目资料与知识库生成"),
        "audience": _text(raw.get("audience"), "项目团队"),
        "narrative": _text(raw.get("narrative"), "资料已整理为汇报叙事,请人工复核关键事实。"),
        "slides": slides,
    }


def ppt_to_markdown(r: dict) -> str:
    lines = [
        f"# {r['title']}",
        (f"> {r['subtitle']}" if r.get("subtitle") else ""),
        "",
        f"**汇报对象:** {r['audience']}　**页数:** {len(r['slides'])}",
        "",
        "## 叙事主线",
        r["narrative"],
        "",
    ]
    for s in r["slides"]:
        lines += [
            f"## 第 {s['no']} 页｜{s['title']}",
            f"**目的:** {s['purpose']}",
            f"**核心观点:** {s['keyMessage']}",
            "",
            *[f"- {b}" for b in s["bullets"]],
            "",
            f"**视觉建议:** {s['visualSuggestion']}",
            f"**讲稿提示:** {s['speakerNotes']}",
            (f"**来源:** {'、'.join(s['sourceRefs'])}" if s["sourceRefs"] else ""),
            "",
        ]
    return "\n".join(x for x in lines if x != "")


# ── 会议纪要 ──
_MIN_SCHEMA = (
    '{\n'
    '  "title":"会议纪要标题","overview":"2-4句总览",\n'
    '  "coreMatters":[{"title":"核心事项","details":["具体事实"]}],\n'
    '  "clientNeedsTranslated":[{"original":"甲方原话/诉求","translated":"设计语言转译","implication":"对推进的影响"}],\n'
    '  "decisions":[{"decision":"明确决议","owner":"负责人或空"}],\n'
    '  "actionItems":[{"task":"待办","owner":"负责人或空","deadline":"期限或空"}],\n'
    '  "chapters":[{"title":"章节标题","summary":"章节摘要"}]\n'
    '}'
)


def build_meeting_prompt(project_name: str, transcript: str, user_input: str):
    system = (
        "你是建筑设计项目的会议纪要编辑。先给结论与全局概览,再按主题组织;明确甲方真实诉求、决议和待办;"
        "不得添加转写中没有的事实。只输出合法 JSON。"
    )
    user = "\n".join(
        [
            f"项目:{project_name}",
            "请把以下会议转写整理成五段式会议纪要。输出 JSON 结构必须为:",
            _MIN_SCHEMA,
            "",
            "要求:五段必须覆盖 纪要总览/核心事项/甲方诉求转译/决议/待办;没有决议或待办返回空数组;不要把猜测写成事实。",
            (f"用户补充:{user_input.strip()}" if user_input.strip() else ""),
            "",
            "会议转写内容:",
            (transcript.strip() or "(没有转写内容)"),
        ]
    )
    return system, user, JSON_FORMAT


def normalize_meeting(value: dict) -> dict:
    raw = _rec(value)
    def _rows(key, *alts):
        return _list(raw.get(key) or next((raw.get(a) for a in alts if raw.get(a)), []))
    return {
        "title": _text(raw.get("title"), "会议纪要"),
        "overview": _text(raw.get("overview") or raw.get("summary"), "暂无总览。"),
        "coreMatters": [
            {"title": _text(_rec(x).get("title"), "核心事项"), "details": _strlist(_rec(x).get("details"))[:8]}
            for x in _rows("coreMatters", "core_matters")
            if _strlist(_rec(x).get("details"))
        ],
        "clientNeedsTranslated": [
            {
                "original": _text(_rec(x).get("original")),
                "translated": _text(_rec(x).get("translated")),
                "implication": _text(_rec(x).get("implication")),
            }
            for x in _rows("clientNeedsTranslated", "client_needs_translated")
            if (_text(_rec(x).get("original")) or _text(_rec(x).get("translated")))
        ],
        "decisions": [
            {"decision": _text(_rec(x).get("decision")), "owner": _text(_rec(x).get("owner"))}
            for x in _rows("decisions")
            if _text(_rec(x).get("decision"))
        ],
        "actionItems": [
            {
                "task": _text(_rec(x).get("task") or _rec(x).get("content")),
                "owner": _text(_rec(x).get("owner")),
                "deadline": _text(_rec(x).get("deadline")),
            }
            for x in _rows("actionItems", "action_items")
            if _text(_rec(x).get("task") or _rec(x).get("content"))
        ],
        "chapters": [
            {"title": _text(_rec(x).get("title"), "章节"), "summary": _text(_rec(x).get("summary"))}
            for x in _rows("chapters")
            if _text(_rec(x).get("summary"))
        ],
    }


def meeting_to_markdown(r: dict) -> str:
    lines = [f"# {r['title']}", "", "## 纪要总览", r["overview"], "", "## 核心事项"]
    lines += [f"- **{m['title']}**:{'；'.join(m['details'])}" for m in r["coreMatters"]] or ["- 无。"]
    lines += ["", "## 甲方诉求转译"]
    lines += [
        f"- 原话/诉求:{c['original'] or '—'}；转译:{c['translated'] or '—'}；影响:{c['implication'] or '—'}"
        for c in r["clientNeedsTranslated"]
    ] or ["- 无。"]
    lines += ["", "## 决议"]
    lines += [f"- {d['decision']}" + (f"｜负责人:{d['owner']}" if d["owner"] else "") for d in r["decisions"]] or ["- 无明确决议。"]
    lines += ["", "## 待办"]
    lines += [
        f"- {a['task']}" + (f"｜负责人:{a['owner']}" if a["owner"] else "") + (f"｜期限:{a['deadline']}" if a["deadline"] else "")
        for a in r["actionItems"]
    ] or ["- 无明确待办。"]
    if r["chapters"]:
        lines += ["", "## 章节"]
        lines += [f"- {c['title']}:{c['summary']}" for c in r["chapters"]]
    return "\n".join(lines)

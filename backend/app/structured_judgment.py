"""判断类结构化输出(研判 / 方案评审 / 任务安排 / 竞品)。

把自由文本判断收敛成稳定结构,配合前端「核心判断优先 + 折叠详情」:
  core      核心判断(80-180字,先结论)
  points    关键要点 [{label, text}]
  actions   下一步动作 [str]
  questions 待确认问题 [str]
  detail    完整展开内容(markdown)

不伪造:normalize 只补缺省/空列表,不编造事实;parse 失败或结构无效时由调用方
回落纯文本(仍 status=ok),绝不硬塞空壳结构。文风约束(PROSE_STYLE)内嵌进 prompt。
"""
from __future__ import annotations

from typing import Any

from .llm import PROSE_STYLE
from .skill_structured import JSON_FORMAT, parse_json_loose, _list, _rec, _strlist, _text

_SCHEMA = (
    '{"core": "核心判断:第一句直接给结论,80-180字", '
    '"points": [{"label": "维度,如 项目定位/关键矛盾/关键约束", "text": "一句话依据"}], '
    '"actions": ["下一步动作,一句一条"], '
    '"questions": ["资料缺口:材料里缺的关键信息,一句一条"], '
    '"detail": "完整展开内容(markdown,可分小节)"}'
)


def build_judgment_prompt(
    project_name: str, instruction: str, context: str, user_extra: str = ""
) -> tuple[str, str, dict]:
    """产出 (system, user, response_format) 给 DeepSeek json mode。判断卡文风内嵌。"""
    system = (
        PROSE_STYLE
        + "\n\n现在产出一张「项目判断卡」,只基于给定材料,不臆测、不编造来源。"
        "必须返回严格 JSON(无额外解释、无代码围栏)。字段含义:\n"
        "- core = 核心判断:第一句直接给结论(80-180字),说『这个项目的关键是…』,不要套话开头。\n"
        "- points = 关键依据:3-6 条,每条 {label,text};label 是维度(项目定位/关键矛盾/关键约束等),"
        "text 一句话,有材料依据就点明。\n"
        "- actions = 下一步:0-5 条可执行动作,每条一句(如『先补地块指标、业态比例、控规边界』)。\n"
        "- questions = 资料缺口:0-5 条材料里缺的关键信息,每条一句(如『未见容积率与建筑高度』),"
        "不要写长段免责。\n"
        "- detail = 完整展开内容(markdown,可分小节)。\n"
        "JSON 结构:\n" + _SCHEMA + "\n"
        "敢下判断:该说『这个方向目前站不住,因为…』『这里还只是口号,没转成空间/材料策略』就说,"
        "不要全是中性废话。"
    )
    parts = [f"项目:{project_name}", "", f"任务:{instruction}"]
    if context:
        parts += ["", "材料:", context]
    if user_extra.strip():
        parts += ["", f"用户补充:{user_extra.strip()}"]
    return system, "\n".join(parts), JSON_FORMAT


def normalize_judgment(value: Any) -> dict:
    """模型 JSON → 稳定结构;字段缺省/别名容错,不崩。"""
    v = _rec(value)
    points: list[dict] = []
    for p in _list(v.get("points")):
        pr = _rec(p)
        label = _text(pr.get("label") or pr.get("dim") or pr.get("name"))
        text = _text(pr.get("text") or pr.get("value") or pr.get("detail"))
        if label or text:
            points.append({"label": label or "要点", "text": text})
    if not points:  # 容错:points 给成了字符串列表
        points = [{"label": "要点", "text": s} for s in _strlist(v.get("points"))]
    return {
        "core": _text(v.get("core") or v.get("summary") or v.get("conclusion")),
        "points": points,
        "actions": _strlist(v.get("actions") or v.get("next") or v.get("nextActions")),
        "questions": _strlist(v.get("questions") or v.get("open") or v.get("toConfirm")),
        "detail": _text(v.get("detail") or v.get("full") or v.get("content")),
    }


def is_meaningful(result: dict) -> bool:
    """至少有 core 或 points 才算结构化成功;否则调用方回落纯文本(不伪造空壳)。"""
    return bool(result.get("core") or result.get("points"))


def judgment_to_markdown(result: dict) -> str:
    """渲染为 markdown(作 content 存储/导出/向后兼容渲染)。"""
    r = result
    out: list[str] = []
    if r.get("core"):
        out += ["**核心判断**", "", r["core"], ""]
    if r.get("points"):
        out.append("**关键依据**")
        out += [f"- **{p.get('label') or '要点'}**：{p.get('text', '')}" for p in r["points"]]
        out.append("")
    if r.get("actions"):
        out.append("**下一步**")
        out += [f"{i}. {a}" for i, a in enumerate(r["actions"], 1)]
        out.append("")
    if r.get("questions"):
        out.append("**资料缺口**")
        out += [f"- {q}" for q in r["questions"]]
        out.append("")
    if r.get("detail"):
        out += ["**完整内容**", "", r["detail"]]
    return "\n".join(out).strip()


def run_structured(
    *, project_name: str, instruction: str, context: str, user_extra: str,
    api_key: str, base_url: str, model: str,
) -> tuple[str, str]:
    """跑一次结构化判断,返回 (content_markdown, output_json)。

    解析得到有效结构 → (judgment_to_markdown, json字符串);
    解析无效(非 JSON / 空壳) → (原始答案, "") 让调用方按纯文本走(不伪造)。
    抛 llm.NotConfigured / llm.LLMError 由调用方接。"""
    import json as _json

    from . import llm

    system, user, fmt = build_judgment_prompt(project_name, instruction, context, user_extra)
    answer = llm.chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        api_key=api_key, base_url=base_url, model=model, response_format=fmt, timeout=90.0,
    )
    result = normalize_judgment(parse_json_loose(answer))
    if is_meaningful(result):
        return judgment_to_markdown(result), _json.dumps(result, ensure_ascii=False)
    return answer, ""  # 回落纯文本

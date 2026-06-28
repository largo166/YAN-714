"""方案评审预检(P1-D):内置固定检查清单模板 + 逐条预检内核。

提交/导出成果前,对照一份固定清单(功能匹配/多专业协同/数据支撑/日照规范…)
让模型逐条判 pass|warn|fail|na 并给依据+出处。
红线(不伪造):材料里没提到的条目一律 na/warn 并写「材料未见」,绝不编合规结论。
"""
from __future__ import annotations

from typing import Any

from .skill_structured import _list, _rec, _strlist, _text, JSON_FORMAT, parse_json_loose  # noqa: F401

# 固定检查清单模板(先内置;后续如需按项目类型切换再做成可配置)。
CHECKLIST: list[dict[str, str]] = [
    {"id": "functional_match", "label": "功能与任务书匹配", "dim": "功能",
     "hint": "方案功能配置是否覆盖任务书要求(业态/规模/配套)。"},
    {"id": "multi_discipline", "label": "多专业协同", "dim": "协同",
     "hint": "建筑/结构/机电/景观是否协同,有无明显打架或缺项。"},
    {"id": "data_support", "label": "关键数据支撑", "dim": "数据",
     "hint": "容积率/建筑密度/退距/限高等关键指标是否有数据支撑。"},
    {"id": "sunlight_code", "label": "日照与规范合规", "dim": "规范",
     "hint": "日照、间距、消防等强条规范是否有依据,有无违规风险。"},
    {"id": "cost_feasibility", "label": "造价与可实施性", "dim": "落地",
     "hint": "结构选型/材料/工艺是否可控,造价与工期是否现实。"},
    {"id": "client_demand", "label": "甲方诉求覆盖", "dim": "诉求",
     "hint": "甲方核心诉求与红线是否被回应,有无遗漏。"},
]

_VALID_STATUS = ("pass", "warn", "fail", "na")
_STATUS_CN = {"pass": "通过", "warn": "注意", "fail": "不符", "na": "未评估"}


def build_precheck_prompt(project_name: str, context: str, review_content: str = ""):
    """构造预检 prompt:对 CHECKLIST 每条逐项判定,严格 JSON。"""
    items_spec = "\n".join(f'  - {c["id"]} | {c["label"]}:{c["hint"]}' for c in CHECKLIST)
    system = (
        "你是资深方案评审专家,负责在成果提交前做一轮『检查清单预检』。"
        "对照给定清单逐条判定方案是否达标,给出一句话依据与材料出处。"
        "只输出合法 JSON,不输出 markdown。"
        "红线:材料里没有依据的条目,status 必须给 na(或 warn)并在 evidence 写「材料未见」,"
        "绝不编造合规结论,尤其是日照/规范这类强条。"
    )
    user = "\n".join(
        [
            "请对下面这版方案逐条预检,严格按清单条目输出。",
            "",
            "检查清单条目(逐条都要给结果):",
            items_spec,
            "",
            "输出 JSON 结构必须为:",
            '{"items":[{"id":"条目id","status":"pass|warn|fail|na",'
            '"finding":"一句话判定依据","evidence":"材料出处或「材料未见」"}]}',
            "",
            "硬性要求:",
            f"- items 必须覆盖上面全部 {len(CHECKLIST)} 个条目的 id,不能漏。",
            "- status 只能是 pass(达标)/warn(存疑或部分)/fail(明显不符)/na(材料不足无法判定)。",
            "- finding 一句话,evidence 必须可追溯到下方材料;材料没提到就写「材料未见」并给 na/warn。",
            "",
            f"项目:{project_name}",
            (f"待评审的方案/评审意见:\n{review_content.strip()}" if review_content.strip() else ""),
            "",
            "项目材料与知识库:",
            (context or "(无可用材料)"),
        ]
    )
    return system, user, JSON_FORMAT


def _norm_status(v: Any) -> str:
    s = _text(v).lower()
    return s if s in _VALID_STATUS else "na"


def normalize_precheck(value: dict) -> dict:
    """把模型 JSON 对齐到 CHECKLIST(缺项补 na/未评估),并统计 summary。不伪造:缺就是 na。"""
    raw = _rec(value)
    by_id: dict[str, dict] = {}
    for it in _list(raw.get("items")):
        rec = _rec(it)
        cid = _text(rec.get("id"))
        if cid:
            by_id[cid] = rec
    items: list[dict] = []
    summary = {"pass": 0, "warn": 0, "fail": 0, "na": 0}
    for c in CHECKLIST:
        rec = by_id.get(c["id"], {})
        status = _norm_status(rec.get("status")) if rec else "na"
        finding = _text(rec.get("finding"), "未评估") if rec else "未评估"
        evidence = _text(rec.get("evidence"), "材料未见") if rec else "材料未见"
        summary[status] += 1
        items.append({
            "id": c["id"], "label": c["label"], "dim": c["dim"],
            "status": status, "finding": finding, "evidence": evidence,
        })
    return {"items": items, "summary": summary}


def precheck_to_markdown(result: dict) -> str:
    s = result.get("summary", {})
    head = (
        f"**评审预检** · {len(result.get('items', []))} 项："
        f"{s.get('pass', 0)} 通过 / {s.get('warn', 0)} 注意 / "
        f"{s.get('fail', 0)} 不符 / {s.get('na', 0)} 未评估"
    )
    lines = [head, ""]
    for it in result.get("items", []):
        cn = _STATUS_CN.get(it["status"], it["status"])
        lines.append(f"- 【{cn}】{it['label']}：{it['finding']}　（出处：{it['evidence']}）")
    return "\n".join(lines)

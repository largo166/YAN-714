"""工作流状态机驱动（规格 D，阶段4）。

STAGE_NODES（16 节点，schemas.STAGE_NODES）此前只建表不驱动。本模块据【已确认认知】算出：
- 每个阶段的完成度（其 cognition_module 是否有 confirmed 字段）；
- 当前所处阶段（最后一个已完成节点的下一个）；
- 下一步建议（upstream 已满足、自身未完成的阶段；并标出被哪些未完成上游卡住）。

红线：完全基于真实的「已确认认知」状态计算，不伪造进度；只读聚合，不自动跑流水线
（纲要：多 Skill 不自动串跑，下一步是"建议"由用户逐步触发）。
无 cognition_module 的纯过程节点（条件梳理/案例/核心问题/空间/体量/图面/汇报/评图）
不靠认知判定完成，只参与依赖关系展示。
"""
from __future__ import annotations

from typing import List

from sqlalchemy.orm import Session

from . import models, safe_json, schemas


def _modules_with_confirmed(db: Session, project_id: int) -> set[str]:
    """该项目里【有至少一个 confirmed 且有值字段】的认知模块集合。"""
    rows = (
        db.query(models.ProjectCognition)
        .filter(models.ProjectCognition.project_id == project_id)
        .all()
    )
    done: set[str] = set()
    for r in rows:
        raw = safe_json.loads_or(r.fields_json, [])
        fields = raw if isinstance(raw, list) else []
        for f in fields:
            if isinstance(f, dict) and f.get("status") == "confirmed" and _nonempty(f.get("value")):
                done.add(r.module)
                break
    return done


def _nonempty(v) -> bool:
    # 复用 analysis 的口径，避免重复实现（延迟导入防循环）
    from .analysis import is_nonempty
    return is_nonempty(v)


def compute_stage_progress(db: Session, project_id: int) -> schemas.StageProgressOut:
    """据已确认认知算 16 节点完成度 + 当前阶段 + 下一步建议。"""
    done_modules = _modules_with_confirmed(db, project_id)

    # 每节点完成判定：
    # - 有 cognition_module 的节点：该模块有已确认认知 → done
    # - 无 cognition_module 的纯过程节点：不靠认知判定（标 process，不计入 done/未完成的认知门槛）
    nodes: List[schemas.StageNodeOut] = []
    done_stages: set[str] = set()
    for spec in schemas.STAGE_NODES:
        mod = spec["cognition_module"]
        if mod:
            is_done = mod in done_modules
            kind = "cognition"
        else:
            is_done = False
            kind = "process"
        if is_done:
            done_stages.add(spec["stage"])
        nodes.append(schemas.StageNodeOut(
            stage=spec["stage"], label=spec["label"],
            cognition_module=mod, kind=kind,
            upstream_required=list(spec["upstream_required"]),
            done=is_done,
        ))

    # 下一步建议：cognition 类节点中，自身未完成、且其 upstream_required 里的【认知类上游】都已完成。
    # 被未完成上游卡住的，记 blocked_by（只看认知类上游，纯过程节点不作为硬门槛——它们无认知可判定）。
    suggestions: List[schemas.StageSuggestionOut] = []
    cognition_stage_module = {s["stage"]: s["cognition_module"] for s in schemas.STAGE_NODES}
    for spec in schemas.STAGE_NODES:
        mod = spec["cognition_module"]
        if not mod or spec["stage"] in done_stages:
            continue  # 纯过程节点 / 已完成节点不进建议
        # 只把"认知类上游"作为门槛（有 cognition_module 的上游）
        blocking = []
        for up in spec["upstream_required"]:
            up_mod = cognition_stage_module.get(up, "")
            if up_mod and up not in done_stages:
                blocking.append(up)
        ready = len(blocking) == 0
        suggestions.append(schemas.StageSuggestionOut(
            stage=spec["stage"], label=spec["label"],
            cognition_module=mod, ready=ready, blocked_by=blocking,
        ))

    # 当前阶段 = 第一个 ready 建议；
    # 无 ready 建议时区分两种情形（不误导回到起点）：
    #   - 所有认知阶段都已完成 → 取最后一个节点（archive 复盘入库），表示流程走到末端
    #   - 否则（尚有认知阶段未完成但都被上游卡住）→ 取第一个节点
    total_cog = sum(1 for s in schemas.STAGE_NODES if s["cognition_module"])
    current = ""
    for s in suggestions:
        if s.ready:
            current = s.stage
            break
    if not current:
        if len(done_stages) >= total_cog and total_cog > 0:
            current = schemas.STAGE_NODES[-1]["stage"]   # 全部认知阶段完成 → 末端(复盘入库)
        else:
            current = schemas.STAGE_NODES[0]["stage"]

    return schemas.StageProgressOut(
        project_id=project_id,
        current_stage=current,
        done_count=len(done_stages),
        total_cognition_stages=total_cog,
        nodes=nodes,
        suggestions=suggestions,
    )

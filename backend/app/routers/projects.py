"""项目 API（CRUD）。"""
import json
import re
from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, safe_json, schemas, stage_machine
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_or_404(db: Session, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def _latest_minutes_for_project(
    db: Session, project_id: int, *, confirmed_only: bool = False
) -> tuple[list[models.Meeting], list[models.MeetingMinute]]:
    meetings = db.query(models.Meeting).filter(models.Meeting.project_id == project_id).all()
    latest: list[models.MeetingMinute] = []
    for meeting in meetings:
        q = db.query(models.MeetingMinute).filter(models.MeetingMinute.meeting_id == meeting.id)
        if confirmed_only:
            q = q.filter(models.MeetingMinute.review_status == "confirmed")
        row = q.order_by(models.MeetingMinute.created_at.desc(), models.MeetingMinute.id.desc()).first()
        if row is not None:
            latest.append(row)
    return meetings, latest


def _todo_title(item: Any) -> str:
    if isinstance(item, str):
        return item.strip()
    if isinstance(item, dict):
        for key in ("title", "text", "task", "content"):
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _is_urgent_todo(item: dict[str, Any]) -> bool:
    value = item.get("urgent")
    if isinstance(value, bool):
        return value
    priority = str(item.get("priority") or item.get("level") or "").lower()
    if priority in {"high", "urgent", "p0", "p1", "高", "紧急"}:
        return True
    due = str(item.get("due") or "").strip()
    if not due:
        return False
    try:
        return date.fromisoformat(due[:10]) <= date.today()
    except ValueError:
        return False


def _milestones_from_minutes(
    minutes: list[models.MeetingMinute],
) -> list[schemas.ProjectMilestoneOut]:
    items: list[schemas.ProjectMilestoneOut] = []
    for minute in minutes:
        todos = safe_json.loads_or(minute.todos_json, [])
        if not isinstance(todos, list):
            continue
        for todo in todos:
            title = _todo_title(todo)
            if not title:
                continue
            if isinstance(todo, dict):
                owner = str(todo.get("owner") or "").strip()
                due = str(todo.get("due") or "").strip()
                urgent = _is_urgent_todo(todo)
            else:
                owner = ""
                due = ""
                urgent = False
            items.append(
                schemas.ProjectMilestoneOut(
                    title=title, owner=owner, due=due, urgent=urgent
                )
            )
    return items


def _progress_from_minutes(minutes: list[models.MeetingMinute]) -> schemas.ProjectProgressOut:
    milestones = _milestones_from_minutes(minutes)
    if not milestones:
        return schemas.ProjectProgressOut(pct=0, next_node="", next_due="")
    reflowed = 0
    for minute in minutes:
        if minute.reflowed:
            reflowed += len(_milestones_from_minutes([minute]))
    pct = round(reflowed / len(milestones) * 100)
    next_item = milestones[min(reflowed, len(milestones) - 1)]
    if pct >= 100:
        return schemas.ProjectProgressOut(pct=100, next_node="", next_due="")
    return schemas.ProjectProgressOut(
        pct=pct, next_node=next_item.title, next_due=next_item.due
    )


def _normalize_risk_level(value: Any) -> str:
    level = str(value or "").strip().lower()
    if level in {"high", "高", "高风险", "严重", "紧急", "p0", "p1"}:
        return "high"
    if level in {"medium", "mid", "中", "中风险", "一般", "p2"}:
        return "medium"
    return ""


def _risk_text(item: dict[str, Any]) -> str:
    for key in ("text", "title", "name", "content", "description"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


# 风险类关键点识别(从研判 points 抽风险);强信号 → high,否则 medium。
_RISK_HINTS = ("难", "风险", "矛盾", "约束", "缺", "问题", "挑战", "瓶颈", "冲突", "逾期", "不足", "限制", "超", "卡", "隐患", "不确定", "待确认")
_RISK_HIGH = ("严重", "致命", "紧急", "重大", "关键矛盾", "逾期", "冲突", "不满足", "超标", "无法", "隐患", "红线")


def _risks_from_leveled(candidates: list[Any]) -> list[schemas.ProjectRiskOut]:
    """显式带 level 的风险结构(未来若真产出 risks[].level 即走这条)。"""
    items: list[schemas.ProjectRiskOut] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        level = _normalize_risk_level(
            item.get("level") or item.get("severity") or item.get("priority")
        )
        text = _risk_text(item)
        if level and text:
            items.append(schemas.ProjectRiskOut(level=level, text=text))
    return items


def _risks_from_points(points: list[Any]) -> list[schemas.ProjectRiskOut]:
    """研判判断卡结构 {points:[{label,text}]} → 风险项:只取风险类关键点,过滤中性点(如项目定位)。
    端点意图本就是从难点/总览研判抽风险;文本用真实研判内容,level 保守推断,不伪造。"""
    items: list[schemas.ProjectRiskOut] = []
    for p in points:
        if not isinstance(p, dict):
            continue
        label = str(p.get("label") or "").strip()
        text = str(p.get("text") or "").strip()
        if not text:
            continue
        blob = label + text
        if not any(h in blob for h in _RISK_HINTS):
            continue  # 过滤"项目定位"等中性关键点,只留风险类
        level = "high" if any(h in blob for h in _RISK_HIGH) else "medium"
        display = f"{label}：{text}" if label and label != "要点" else text
        items.append(schemas.ProjectRiskOut(level=level, text=display))
    return items


def _extract_structured_risks(text: str) -> list[schemas.ProjectRiskOut]:
    """从研判 output_json 抽风险。注意:传入的应是 output_json(结构化 JSON),不是 content(markdown)。"""
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return []
    if isinstance(data, dict):
        for key in ("risks", "risk_items", "items", "风险", "风险项"):
            value = data.get(key)
            if isinstance(value, list):
                return _risks_from_leveled(value)
        if isinstance(data.get("points"), list):  # 研判判断卡结构
            return _risks_from_points(data["points"])
        return _risks_from_leveled([data])
    if isinstance(data, list):
        return _risks_from_leveled(data)
    return []


def _project_risks(db: Session, project_id: int) -> list[schemas.ProjectRiskOut]:
    rows = (
        db.query(models.ProjectAnalysis)
        .filter(
            models.ProjectAnalysis.project_id == project_id,
            models.ProjectAnalysis.status == "ok",
            models.ProjectAnalysis.task.in_(
                ("difficulty", "overview", "design_difficulty", "project_overview")
            ),
        )
        .order_by(models.ProjectAnalysis.created_at.desc(), models.ProjectAnalysis.id.desc())
        .all()
    )
    if not rows:
        return []
    row = rows[0]
    # 之前的 bug:对 content(markdown)做 json.loads 永远失败 → 恒空。改读 output_json(结构化)。
    return _extract_structured_risks(row.output_json or row.content)


def _asset_kind(doc: models.KnowledgeDocument) -> str:
    tags = [part.strip() for part in re.split(r"[,，;；\s]+", doc.tags or "") if part.strip()]
    joined = " ".join(tags).lower()
    if "prompt" in joined or "提示" in joined:
        return "Prompt"
    if "类比" in joined or "案例" in joined:
        return "类比"
    if "方法" in joined or "模板" in joined:
        return "方法"
    if "理论" in joined:
        return "理论"
    if tags:
        return tags[0]
    return doc.file_type or "资料"


def _project_assets(db: Session, project_id: int) -> list[schemas.ReusableAssetOut]:
    project_files = (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.status == "active",
            models.ProjectFile.indexed_doc_id > 0,
        )
        .all()
    )
    doc_ids = [row.indexed_doc_id for row in project_files]
    if not doc_ids:
        return []
    docs = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.id.in_(doc_ids))
        .order_by(models.KnowledgeDocument.created_at.desc(), models.KnowledgeDocument.id.desc())
        .all()
    )
    seen: set[tuple[str, str]] = set()
    items: list[schemas.ReusableAssetOut] = []
    for doc in docs:
        kind = _asset_kind(doc)
        name = doc.title.strip()
        if not name or (kind, name) in seen:
            continue
        seen.add((kind, name))
        items.append(schemas.ReusableAssetOut(kind=kind, name=name))
    return items


@router.get("", response_model=schemas.ProjectListOut)
def list_projects(db: Session = Depends(get_db)) -> schemas.ProjectListOut:
    items = db.query(models.Project).order_by(models.Project.created_at.desc()).all()
    return schemas.ProjectListOut(items=items, total=len(items))


@router.get("/{project_id}/overview", response_model=schemas.ProjectOverviewOut)
def project_overview(
    project_id: int, db: Session = Depends(get_db)
) -> schemas.ProjectOverviewOut:
    """项目中心 KPI 真实计数（只读聚合，不改任何数据；0 是真实值）。"""
    _get_or_404(db, project_id)
    files = (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.status == "active",
        )
        .count()
    )
    meetings, _ = _latest_minutes_for_project(db, project_id)
    minutes = 0
    todos = 0
    for meeting in meetings:
        rows = (
            db.query(models.MeetingMinute)
            .filter(models.MeetingMinute.meeting_id == meeting.id)
            .order_by(models.MeetingMinute.created_at.desc(), models.MeetingMinute.id.desc())
            .all()
        )
        minutes += len(rows)
        if rows:  # 仅最新一版纪要的待办计入，避免重生成重复计数
            items = safe_json.loads_or(rows[0].todos_json, [])
            if isinstance(items, list):
                todos += len(items)
    return schemas.ProjectOverviewOut(
        files=files,
        meetings=len(meetings),
        todos=todos,
        minutes=minutes,
        risks=len(_project_risks(db, project_id)),
        assets=len(_project_assets(db, project_id)),
        gaps=0,
    )


@router.get("/{project_id}/milestones", response_model=schemas.ProjectMilestoneListOut)
def project_milestones(
    project_id: int, db: Session = Depends(get_db)
) -> schemas.ProjectMilestoneListOut:
    _get_or_404(db, project_id)
    _, latest_minutes = _latest_minutes_for_project(db, project_id, confirmed_only=True)
    return schemas.ProjectMilestoneListOut(items=_milestones_from_minutes(latest_minutes))


@router.get("/{project_id}/progress", response_model=schemas.ProjectProgressOut)
def project_progress(
    project_id: int, db: Session = Depends(get_db)
) -> schemas.ProjectProgressOut:
    _get_or_404(db, project_id)
    _, latest_minutes = _latest_minutes_for_project(db, project_id, confirmed_only=True)
    return _progress_from_minutes(latest_minutes)


@router.get("/{project_id}/risks", response_model=schemas.ProjectRiskListOut)
def project_risks(
    project_id: int, db: Session = Depends(get_db)
) -> schemas.ProjectRiskListOut:
    _get_or_404(db, project_id)
    return schemas.ProjectRiskListOut(items=_project_risks(db, project_id))


@router.get("/{project_id}/reusable-assets", response_model=schemas.ReusableAssetListOut)
def project_reusable_assets(
    project_id: int, db: Session = Depends(get_db)
) -> schemas.ReusableAssetListOut:
    _get_or_404(db, project_id)
    return schemas.ReusableAssetListOut(items=_project_assets(db, project_id))


@router.get("/{project_id}/stage-progress", response_model=schemas.StageProgressOut)
def project_stage_progress(
    project_id: int, db: Session = Depends(get_db)
) -> schemas.StageProgressOut:
    """工作流状态机驱动（阶段4）：据已确认认知算阶段完成度 + 当前阶段 + 下一步建议。
    只读聚合，建议由用户逐步触发，不自动跑流水线（不伪造进度）。"""
    _get_or_404(db, project_id)
    return stage_machine.compute_stage_progress(db, project_id)


@router.post("/{project_id}/team-assignments", response_model=schemas.TeamAssignmentCreateOut, status_code=201)
def create_team_assignment(
    project_id: int, payload: schemas.TeamAssignmentCreate, db: Session = Depends(get_db)
) -> models.TeamAssignment:
    _get_or_404(db, project_id)
    member = db.get(models.TeamMember, payload.member_id)
    if member is None or member.status != "active":
        raise HTTPException(status_code=404, detail="成员不存在")
    row = models.TeamAssignment(
        project_id=project_id,
        member_id=payload.member_id,
        task_title=payload.task_title,
        due=payload.due,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db)) -> models.Project:
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)) -> models.Project:
    return _get_or_404(db, project_id)


@router.put("/{project_id}", response_model=schemas.ProjectOut)
def update_project(
    project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db)
) -> models.Project:
    project = _get_or_404(db, project_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> None:
    project = _get_or_404(db, project_id)
    db.delete(project)
    db.commit()
    return None

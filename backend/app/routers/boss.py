"""管理驾驶舱 · 只读聚合端点。"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, safe_json, schemas
from ..database import get_db
from .projects import (
    _latest_minutes_for_project,
    _milestones_from_minutes,
    _project_risks,
)

router = APIRouter(prefix="/api/boss", tags=["boss"])

# 生图技能(与 skills._IMAGE_SKILLS 一致):AI 使用统计里的「生图」按这些技能的成果数计。
_IMAGE_SKILL_IDS = ("img", "facade", "moodboard")


def _week_start() -> datetime:
    # 归零到本周一 00:00:否则周一(weekday()==0)时 start≈now,会漏掉当天早些时候的记录。
    now = datetime.utcnow()
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _near_delivery_count(db: Session, days: int = 14) -> int:
    """跨活跃项目,统计 14 天内到期的里程碑(来自最新纪要待办的 due,可解析绝对日期才计)。
    口径:与项目中心里程碑同源(_milestones_from_minutes);解析不出的中文相对日期不计,不伪造。"""
    today = date.today()
    horizon = today + timedelta(days=days)
    n = 0
    projects = db.query(models.Project).filter(models.Project.status == "active").all()
    for project in projects:
        _, minutes = _latest_minutes_for_project(db, project.id)
        for milestone in _milestones_from_minutes(minutes):
            due = (milestone.due or "").strip()
            try:
                d = date.fromisoformat(due[:10])
            except ValueError:
                continue
            if today <= d <= horizon:
                n += 1
    return n


@router.get("/dashboard", response_model=schemas.BossDashboardOut)
def dashboard(db: Session = Depends(get_db)) -> schemas.BossDashboardOut:
    start = _week_start()
    projects = db.query(models.Project).all()
    active_projects = sum(1 for project in projects if project.status == "active")
    high_risks = 0
    for project in projects:
        high_risks += sum(1 for item in _project_risks(db, project.id) if item.level == "high")
    analysis_count = (
        db.query(models.ProjectAnalysis)
        .filter(models.ProjectAnalysis.created_at >= start)
        .count()
    )
    minute_count = (
        db.query(models.MeetingMinute)
        .filter(models.MeetingMinute.created_at >= start)
        .count()
    )
    return schemas.BossDashboardOut(
        active_projects=active_projects,
        near_delivery=_near_delivery_count(db),
        high_risks=high_risks,
        ai_usage_week=analysis_count + minute_count,
    )


@router.get("/workload", response_model=schemas.WorkloadListOut)
def workload(db: Session = Depends(get_db)) -> schemas.WorkloadListOut:
    members = (
        db.query(models.TeamMember)
        .filter(models.TeamMember.status == "active")
        .order_by(models.TeamMember.id.asc())
        .all()
    )
    if not members:
        return schemas.WorkloadListOut(items=[])

    counts = {member.name: 0 for member in members}
    projects = db.query(models.Project).filter(models.Project.status == "active").all()
    for project in projects:
        _, minutes = _latest_minutes_for_project(db, project.id)
        for minute in minutes:
            todos = safe_json.loads_or(minute.todos_json, [])
            if not isinstance(todos, list):
                continue
            for todo in todos:
                if not isinstance(todo, dict):
                    continue
                owner = str(todo.get("owner") or "").strip()
                if owner in counts:
                    counts[owner] += 1

    # 任务看板负荷:技能成果/手工落库的未完成任务(source_minute_id==0)。
    # 纪要派生的任务(source_minute_id>0)已由上面纪要 todos 计入,这里排除以免双计。
    active_ids = [project.id for project in projects]
    if active_ids:
        member_name_by_id = {member.id: member.name for member in members}
        assignments = (
            db.query(models.TeamAssignment)
            .filter(
                models.TeamAssignment.project_id.in_(active_ids),
                models.TeamAssignment.status != "done",
                models.TeamAssignment.source_minute_id == 0,
            )
            .all()
        )
        for assignment in assignments:
            name = member_name_by_id.get(assignment.member_id) or (assignment.owner_name or "").strip()
            if name in counts:
                counts[name] += 1

    max_count = max(counts.values(), default=0)
    if max_count == 0:
        return schemas.WorkloadListOut(items=[])

    items: list[schemas.WorkloadItemOut] = []
    for name, count in counts.items():
        if count == 0:
            continue
        pct = round(count / max_count * 100)
        if pct >= 80:
            level = "high"
        elif pct >= 40:
            level = "medium"
        else:
            level = "low"
        items.append(schemas.WorkloadItemOut(name=name, pct=pct, level=level))
    return schemas.WorkloadListOut(items=items)


@router.get("/ai-usage", response_model=schemas.AiUsageListOut)
def ai_usage(db: Session = Depends(get_db)) -> schemas.AiUsageListOut:
    analyses = db.query(models.ProjectAnalysis).all()
    minutes = db.query(models.MeetingMinute).count()
    counts = {
        "PPT": 0,
        "纪要": minutes,
        "生图": 0,
        "评审": 0,
        "任务": 0,
    }
    for row in analyses:
        if row.task == "report":
            counts["PPT"] += 1
        elif row.task in {"difficulty", "overview"}:
            counts["评审"] += 1
        elif row.task == "plan":
            counts["任务"] += 1

    # 生图:统计真实生图技能成果(SkillResult),原来恒 0(无自增来源)。
    counts["生图"] = (
        db.query(models.SkillResult)
        .filter(models.SkillResult.skill_id.in_(_IMAGE_SKILL_IDS))
        .count()
    )

    return schemas.AiUsageListOut(
        items=[
            schemas.AiUsageItemOut(capability=capability, count=count)
            for capability, count in counts.items()
        ]
    )


@router.get("/feishu-board", response_model=schemas.NotConfiguredListOut)
def feishu_board() -> schemas.NotConfiguredListOut:
    return schemas.NotConfiguredListOut(status="not_configured", items=[])


@router.get("/comments", response_model=schemas.NotConfiguredListOut)
def comments() -> schemas.NotConfiguredListOut:
    return schemas.NotConfiguredListOut(status="not_configured", items=[])

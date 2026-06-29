"""管理驾驶舱 · 只读聚合端点。"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, safe_json, schemas
from ..database import get_db
from .projects import _latest_minutes_for_project, _project_risks

router = APIRouter(prefix="/api/boss", tags=["boss"])


def _week_start() -> datetime:
    # 归零到本周一 00:00:否则周一(weekday()==0)时 start≈now,会漏掉当天早些时候的记录。
    now = datetime.utcnow()
    monday = now - timedelta(days=now.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


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
        near_delivery=0,
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

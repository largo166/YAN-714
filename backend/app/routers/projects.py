"""项目 API（CRUD）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get_or_404(db: Session, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


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
    meetings = (
        db.query(models.Meeting).filter(models.Meeting.project_id == project_id).all()
    )
    minutes = 0
    todos = 0
    for meeting in meetings:
        rows = (
            db.query(models.MeetingMinute)
            .filter(models.MeetingMinute.meeting_id == meeting.id)
            .order_by(models.MeetingMinute.created_at.desc())
            .all()
        )
        minutes += len(rows)
        if rows:  # 仅最新一版纪要的待办计入，避免重生成重复计数
            items = safe_json.loads_or(rows[0].todos_json, [])
            if isinstance(items, list):
                todos += len(items)
    return schemas.ProjectOverviewOut(
        files=files, meetings=len(meetings), todos=todos, minutes=minutes
    )


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

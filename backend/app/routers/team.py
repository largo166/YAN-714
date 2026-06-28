"""协作平台 · 团队成员 + 任务看板(P0-A)。"""
from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/team", tags=["team"])


def _task_dict(a: models.TeamAssignment) -> dict:
    return {
        "id": a.id,
        "project_id": a.project_id,
        "task_title": a.task_title,
        "owner_name": a.owner_name,
        "member_id": a.member_id,
        "due": a.due,
        "status": a.status,
        "source_minute_id": a.source_minute_id,
        "source_result_id": a.source_result_id,
        "done_at": a.done_at.isoformat() if a.done_at else None,
        "created_at": a.created_at.isoformat(),
    }


@router.get("/assignments")
def list_assignments(project_id: int, db: Session = Depends(get_db)) -> dict:
    """某项目的任务看板数据(含来自会议纪要的 + 手工的)。前端按 status 分三列。"""
    rows = (
        db.query(models.TeamAssignment)
        .filter(models.TeamAssignment.project_id == project_id)
        .order_by(models.TeamAssignment.id.desc())
        .all()
    )
    return {"items": [_task_dict(a) for a in rows], "total": len(rows)}


@router.patch("/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int, status: str = Body(..., embed=True), db: Session = Depends(get_db)
) -> dict:
    """状态流转:todo / doing / done。置 done 记 done_at,退回则清空。"""
    a = db.get(models.TeamAssignment, assignment_id)
    if a is None:
        raise HTTPException(404, "任务不存在")
    st = (status or "").strip()
    if st not in ("todo", "doing", "done"):
        raise HTTPException(400, "状态非法")
    a.status = st
    a.done_at = datetime.utcnow() if st == "done" else None
    db.commit()
    db.refresh(a)
    return _task_dict(a)


@router.get("/members", response_model=schemas.TeamMemberListOut)
def list_members(db: Session = Depends(get_db)) -> schemas.TeamMemberListOut:
    members = (
        db.query(models.TeamMember)
        .filter(models.TeamMember.status == "active")
        .order_by(models.TeamMember.created_at.desc(), models.TeamMember.id.desc())
        .all()
    )
    items: list[schemas.TeamMemberOut] = []
    for member in members:
        rows = (
            db.query(models.TeamAssignment)
            .filter(models.TeamAssignment.member_id == member.id)
            .order_by(models.TeamAssignment.created_at.desc(), models.TeamAssignment.id.desc())
            .all()
        )
        items.append(
            schemas.TeamMemberOut(
                id=member.id,
                name=member.name,
                role=member.role,
                duty=member.duty,
                birthday=member.birthday,
                assignments=[
                    schemas.TeamAssignmentOut(
                        task_title=row.task_title,
                        due=row.due,
                        project_id=row.project_id,
                    )
                    for row in rows
                ],
            )
        )
    return schemas.TeamMemberListOut(items=items)


@router.post("/members", response_model=schemas.TeamMemberOut, status_code=201)
def create_member(
    payload: schemas.TeamMemberCreate, db: Session = Depends(get_db)
) -> models.TeamMember:
    member = models.TeamMember(**payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.put("/members/{member_id}", response_model=schemas.TeamMemberOut)
def update_member(
    member_id: int, payload: schemas.TeamMemberUpdate, db: Session = Depends(get_db)
) -> models.TeamMember:
    member = db.get(models.TeamMember, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="成员不存在")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return member


@router.delete("/members/{member_id}", status_code=204)
def delete_member(member_id: int, db: Session = Depends(get_db)) -> None:
    member = db.get(models.TeamMember, member_id)
    if member is None:
        raise HTTPException(status_code=404, detail="成员不存在")
    member.status = "trashed"
    db.commit()
    return None

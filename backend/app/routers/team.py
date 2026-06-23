"""协作平台 · 团队成员。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/team", tags=["team"])


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

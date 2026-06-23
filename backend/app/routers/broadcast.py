"""协作平台 / 管理驾驶舱 · 全员通知与走马灯。"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/broadcast", tags=["broadcast"])


@router.get("/broadcasts", response_model=schemas.BroadcastListOut)
def list_broadcasts(db: Session = Depends(get_db)) -> schemas.BroadcastListOut:
    items = (
        db.query(models.Broadcast)
        .filter(models.Broadcast.active.is_(True))
        .order_by(models.Broadcast.created_at.desc(), models.Broadcast.id.desc())
        .all()
    )
    return schemas.BroadcastListOut(items=items)


@router.post("/broadcasts", response_model=schemas.BroadcastOut, status_code=201)
def create_broadcast(
    payload: schemas.BroadcastCreate, db: Session = Depends(get_db)
) -> models.Broadcast:
    row = models.Broadcast(text=payload.text.strip())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/ticker", response_model=schemas.TickerListOut)
def ticker(db: Session = Depends(get_db)) -> schemas.TickerListOut:
    items: list[schemas.TickerItemOut] = []
    broadcasts = (
        db.query(models.Broadcast)
        .filter(models.Broadcast.active.is_(True))
        .order_by(models.Broadcast.created_at.desc(), models.Broadcast.id.desc())
        .all()
    )
    for row in broadcasts:
        if row.text.strip():
            items.append(schemas.TickerItemOut(kind="broadcast", text=row.text.strip()))

    today = date.today().strftime("%m-%d")
    members = (
        db.query(models.TeamMember)
        .filter(
            models.TeamMember.status == "active",
            models.TeamMember.birthday == today,
        )
        .order_by(models.TeamMember.id.asc())
        .all()
    )
    for member in members:
        items.append(schemas.TickerItemOut(kind="birthday", text=f"今天是 {member.name} 的生日"))
    return schemas.TickerListOut(items=items)

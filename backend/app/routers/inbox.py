"""收件箱监听端点(P1-C):配置收件箱路径 / 查状态 / 手动触发扫描入库。

自动扫描由 launcher 后台轮询线程定时 POST /scan(frozen exe);此处的手动 /scan
是后台线程不可靠时的兜底。优雅降级:路径未配/不存在 → accessible=false,不报 500。
"""
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import inbox, models
from ..database import get_db

router = APIRouter(prefix="/api/inbox", tags=["inbox"])


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/status")
def inbox_status(db: Session = Depends(get_db)) -> dict:
    cfg = _settings(db)
    path = (cfg.inbox_root_path or "").strip()
    accessible = bool(path) and Path(path).is_dir()
    pending = len(inbox.candidate_files(Path(path))) if accessible else 0
    return {"inbox_root_path": path, "accessible": accessible, "pending": pending}


@router.post("/config")
def inbox_config(path: str = Body("", embed=True), db: Session = Depends(get_db)) -> dict:
    cfg = _settings(db)
    p = (path or "").strip()
    if p and not Path(p).is_dir():
        raise HTTPException(400, f"收件箱路径不存在:{p}")
    cfg.inbox_root_path = p
    db.commit()
    return {"inbox_root_path": p, "accessible": bool(p) and Path(p).is_dir()}


@router.post("/scan")
def inbox_scan(db: Session = Depends(get_db)) -> dict:
    """手动触发一次扫描入库。"""
    return inbox.scan_once(db)

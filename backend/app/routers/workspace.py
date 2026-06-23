"""项目工作区目录管理 + 安全清理 API（Phase 4C）。

真实项目目录默认只读 scan/preview；apply/restore 需显式传 confirm 且建议仅用于临时目录。
"""
from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from .. import models, workspace
from ..database import get_db

router = APIRouter(prefix="/api/workspace", tags=["workspace"])


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/status")
def status(db: Session = Depends(get_db)):
    cfg = _settings(db)
    path = cfg.workspace_path or ""
    from pathlib import Path

    accessible = bool(path) and Path(path).is_dir()
    return {"workspace_path": path, "accessible": accessible}


@router.post("/config")
def set_config(path: str = Body(..., embed=True), db: Session = Depends(get_db)):
    cfg = _settings(db)
    cfg.workspace_path = path
    db.commit()
    from pathlib import Path

    return {"workspace_path": path, "accessible": Path(path).is_dir()}


@router.post("/scan")
def scan(db: Session = Depends(get_db)):
    cfg = _settings(db)
    if not cfg.workspace_path:
        return {"accessible": False, "error": "未配置项目目录"}
    res = workspace.scan(cfg.workspace_path)
    return {
        "accessible": res.accessible,
        "root": res.root,
        "error": res.error,
        "total_files": res.total_files,
        "total_dirs": res.total_dirs,
        "total_size": res.total_size,
        "type_stats": res.type_stats,
        "recent_files": [e.__dict__ for e in res.recent_files],
        "large_files": [e.__dict__ for e in res.large_files],
        "auto_cleanable": [e.__dict__ for e in res.auto_cleanable],
        "review_items": [e.__dict__ for e in res.review_items],
    }


@router.post("/cleanup/preview")
def cleanup_preview(db: Session = Depends(get_db)):
    cfg = _settings(db)
    if not cfg.workspace_path:
        return {"accessible": False, "error": "未配置项目目录"}
    return workspace.cleanup_preview(cfg.workspace_path)


@router.post("/cleanup/apply")
def cleanup_apply(
    rel_paths: list[str] = Body(..., embed=True),
    confirm: bool = Body(False, embed=True),
    db: Session = Depends(get_db),
):
    """安全清理：移动到隔离区。需 confirm=true。永不删除。"""
    cfg = _settings(db)
    if not cfg.workspace_path:
        return {"ok": False, "error": "未配置项目目录"}
    if not confirm:
        return {"ok": False, "error": "需要 confirm=true 才能 apply（仅移动到隔离区，可 restore）"}
    return workspace.cleanup_apply(cfg.workspace_path, rel_paths)


@router.post("/cleanup/restore")
def cleanup_restore(timestamp: str = Body(..., embed=True), db: Session = Depends(get_db)):
    cfg = _settings(db)
    if not cfg.workspace_path:
        return {"ok": False, "error": "未配置项目目录"}
    return workspace.cleanup_restore(cfg.workspace_path, timestamp)

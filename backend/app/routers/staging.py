"""staging 收料单 API（检查点① 铁条2）：选文件/文件夹 → 只读盘扫描出分组/统计/去重预览。

铁律（与 filesystem.py 一致）：
- 纯只读——只 stat/iterdir，绝不落库、不拷贝、不移动、不写盘。真正入库在 ingest（执行）阶段。
- 去重预览：同名同大小（复用现有 _already_imported 语义）；content_hash 精确去重等 0023 迁移后升级。
- 按来源文件夹分组；每组建议项目名=文件夹名；若该文件夹已建过项目（source_path 命中）则带出其 id。
- 全链路 pathlib + UTF-8；跳过内部目录（_trash / 隔离区 / _done / _failed）。
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, parsing, schemas
from ..database import get_db
from ..safe_paths import sanitize_filename

router = APIRouter(prefix="/api/staging", tags=["staging"])

# 递归展开时跳过的内部目录（与 uploads/inbox/filesystem 的隐藏目录口径一致）
_SKIP_DIRS = {"_trash", "_done", "_failed", "_assets", "_ROMAI_CLEANUP_QUARANTINE"}
_MAX_FILES = 5000  # 收料单上限：单次 staging 扫描的文件数硬顶，超出截断并如实标注（防误选巨型目录卡死）


def _norm_source(p: str | Path) -> str:
    """源路径去重键：绝对化 + 平台大小写归一（与 project_files._find_or_create_project 同键）。"""
    try:
        return os.path.normcase(os.path.abspath(str(p)))
    except OSError:
        return str(p)


def _iter_files(root: Path):
    """递归产出 root 下的文件（跳过内部目录）；root 本身是文件则产出自身。"""
    if root.is_file():
        yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIRS]
        for fn in filenames:
            yield Path(dirpath) / fn


def _project_id_for(db: Session, source_dir: str) -> int:
    """该来源文件夹是否已建过项目（按 source_path 命中，与建项去重同键）；未建返回 0。"""
    row = (
        db.query(models.Project.id)
        .filter(models.Project.source_path == _norm_source(source_dir))
        .first()
    )
    return int(row[0]) if row else 0


def _already_indexed(db: Session, project_id: int, filename: str, size: int) -> bool:
    """同名同大小的活动文件已在该项目入库 → 标灰（复用 _already_imported 语义）。"""
    if project_id <= 0:
        return False
    return (
        db.query(models.ProjectFile.id)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.filename == sanitize_filename(filename),
            models.ProjectFile.size == size,
            models.ProjectFile.status == "active",
        )
        .first()
        is not None
    )


@router.post("", response_model=schemas.StagingOut)
def build_staging(payload: schemas.StagingIn, db: Session = Depends(get_db)) -> schemas.StagingOut:
    """把选中的绝对路径（文件/文件夹混合）扫成收料单：分组 + 类型统计 + 去重标灰。只读盘。"""
    raw_paths = [p.strip() for p in (payload.paths or []) if p and p.strip()]
    if not raw_paths:
        return schemas.StagingOut(error="未选择任何文件或文件夹")

    # 分组：每个「顶层选中项」归入一个来源组——
    #   选中的是文件夹 → 该文件夹为一组（其下递归文件）；
    #   选中的是文件 → 归入其父目录组（同父目录的散选文件并到一组）。
    groups: dict[str, schemas.StagingGroupOut] = {}
    type_stats: dict[str, int] = {}
    total = supported_cnt = indexed_cnt = skipped_unsupported = 0
    truncated = False

    def group_for(source_dir: Path) -> schemas.StagingGroupOut:
        key = _norm_source(source_dir)
        g = groups.get(key)
        if g is None:
            pid = _project_id_for(db, str(source_dir))
            g = schemas.StagingGroupOut(
                source_dir=str(source_dir), project_hint=source_dir.name or str(source_dir), project_id=pid, files=[]
            )
            groups[key] = g
        return g

    for raw in raw_paths:
        top = Path(raw)
        try:
            if not top.exists():
                continue  # 选中的路径已不存在：跳过（不抛，收料单尽力而为）
        except OSError:
            continue
        source_dir = top if top.is_dir() else top.parent
        for f in _iter_files(top):
            if total >= _MAX_FILES:
                truncated = True
                break
            try:
                size = f.stat().st_size
            except OSError:
                continue
            total += 1
            ext = f.suffix.lower()
            type_stats[ext or "(无扩展名)"] = type_stats.get(ext or "(无扩展名)", 0) + 1
            sup = parsing.is_supported(f.name)
            if not sup:
                skipped_unsupported += 1
            else:
                supported_cnt += 1
            g = group_for(source_dir if top.is_dir() else f.parent)
            idx = _already_indexed(db, g.project_id, f.name, size)
            if idx:
                indexed_cnt += 1
            g.files.append(
                schemas.StagingFileOut(
                    abs_path=str(f), name=f.name, ext=ext, size=size, supported=sup, already_indexed=idx
                )
            )
        if truncated:
            break

    ordered = sorted(groups.values(), key=lambda gr: gr.source_dir.lower())
    return schemas.StagingOut(
        groups=ordered,
        total_files=total,
        supported_files=supported_cnt,
        already_indexed=indexed_cnt,
        type_stats=type_stats,
        skipped_unsupported=skipped_unsupported,
        error=(f"文件数超过 {_MAX_FILES} 上限，仅列出前 {total} 个" if truncated else ""),
    )

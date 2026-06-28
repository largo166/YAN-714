"""收件箱监听(P1-C):扫描收件箱文件夹,新文件自动入库(复用现有整理/解析管线)。

方案 B(扫描制,非 watchdog):frozen exe 窗口化下后台线程的异常会被静默吞掉,
故 scan_once 整体 try/except 逐文件兜底,且前端必须保留「立即扫描」手动兜底。
复用 project_files 的入库三件套(不重写):_find_or_create_project / _store_file /
_already_imported / _index_project_file。入库成功/跳过后把源文件移到 _done/(权威已处理标记)。
不伪造:解析失败照 parse_status 如实登记,只对有正文者入库。
"""
from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from . import models, parsing, safe_json
from .routers.project_files import (
    _already_imported,
    _find_or_create_project,
    _index_project_file,
    _store_file,
)

INBOX_PROJECT_NAME = "收件箱"
_SKIP_DIRS = {"_done", "_failed", "_trash"}


def _inbox_root(db: Session) -> str:
    cfg = db.get(models.AppSetting, 1)
    return ((cfg.inbox_root_path if cfg else "") or "").strip()


def candidate_files(root: Path) -> list[Path]:
    """收件箱里待处理的受支持文件(跳过内部 _done/_failed/_trash/_ROMAI* 目录)。"""
    out: list[Path] = []
    try:
        for p in root.rglob("*"):
            if p.is_dir():
                continue
            parts = p.relative_to(root).parts
            if any(part in _SKIP_DIRS or part.startswith("_ROMAI") for part in parts):
                continue
            if parsing.is_supported(p.name):
                out.append(p)
    except OSError:
        pass
    return out


def _move_aside(path: Path, dest_dir: Path) -> None:
    """把已处理的源文件移到 _done/_failed(避免下次重复扫;重名加序号)。移动失败不致命。"""
    try:
        dest_dir.mkdir(parents=True, exist_ok=True)
        target = dest_dir / path.name
        i = 1
        while target.exists():
            target = dest_dir / f"{path.stem}_{i}{path.suffix}"
            i += 1
        shutil.move(str(path), str(target))
    except OSError:
        pass  # DB 去重作兜底,移动失败不影响正确性


def scan_once(db: Session) -> dict:
    """扫描收件箱一次 → 入库。返回计数。空配置/路径不存在 → accessible=False(不报错)。"""
    root_str = _inbox_root(db)
    base = {"accessible": False, "scanned": 0, "imported": 0, "indexed": 0, "skipped": 0, "failed": 0}
    if not root_str:
        return {**base, "reason": "未配置收件箱"}
    root = Path(root_str)
    if not root.is_dir():
        return {**base, "reason": "收件箱路径不存在"}

    project = _find_or_create_project(db, INBOX_PROJECT_NAME, str(root))
    done_dir, failed_dir = root / "_done", root / "_failed"
    scanned = imported = indexed = skipped = failed = 0

    for path in candidate_files(root):
        scanned += 1
        try:
            size = path.stat().st_size
        except OSError:
            failed += 1
            continue
        if _already_imported(db, project.id, path.name, size):
            skipped += 1
            _move_aside(path, done_dir)  # 已入库的也挪走,杜绝反复扫
            continue
        try:
            stored, storage_root = _store_file(db, project, path)
            pr = parsing.parse_file(stored.abs_path)
            pf = models.ProjectFile(
                project_id=project.id,
                filename=stored.filename,
                stored_path=stored.stored_path,
                storage_root=storage_root,
                file_type=stored.filename.rsplit(".", 1)[-1].lower() if "." in stored.filename else "",
                size=stored.size,
                parse_status=pr.status,
                parse_error=pr.error,
                content_text=pr.text,
                content_chunks_json=safe_json.dumps_safe(pr.chunks) if pr.chunks else "",
                truncated_at_page=pr.truncated_at_page,
                total_pages=pr.total_pages,
                status="active",
            )
            db.add(pf)
            db.commit()
            db.refresh(pf)
            imported += 1
            if _index_project_file(db, pf):
                indexed += 1
            _move_aside(path, done_dir)  # 入库成功 → 移走原件(权威已处理标记)
        except Exception as exc:  # noqa: BLE001  单文件失败不阻断其它
            db.rollback()
            failed += 1
            _move_aside(path, failed_dir)
            print(f"inbox scan failed: {path}: {exc}")

    return {
        "accessible": True, "project_id": project.id,
        "scanned": scanned, "imported": imported, "indexed": indexed,
        "skipped": skipped, "failed": failed,
    }

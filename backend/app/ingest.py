"""一键清理·入库编排器（检查点① 铁条3，dev 态）。

把 inbox.scan_once 的单文件五段逻辑抽成可复用编排，对 staging 选中的文件逐个跑：
  落盘 → 解析(识别·抽取·切块，parse_file 一次原子调用) → 入库+索引 → 归档抽图。
逐文件逐段真实推进度（不拆假进度：解析是一次调用，如实标一段）。

与收件箱差异：
- 不移动源文件（桌面资料只读复制进库，不动用户原件；语义同 upload_file）。
- 进度存内存（模块级 _JOBS）。DB-backed 续跑（ingest_jobs 表）依赖 0023 迁移，卡检查点0 exe 命门——
  本 dev 版不做续跑：进程重开进度即丢、重跑（回执去重仍靠 _already_imported，不会产生重复入库）。
- 归档全部完成后，挂一次研判触发钩子（零·B2）：对项目排队调现有 analyze（复用，不新造）。

DeepSeek 边界（零·B1）：五段内零 LLM，纯机械确定性。研判在五段之后的独立异步环节。
"""
from __future__ import annotations

import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from . import models, parsing, safe_json
from .database import SessionLocal
from .routers.project_files import (
    _already_imported,
    _extract_and_store_assets,
    _find_or_create_project,
    _index_project_file,
    _store_file,
)

# 内存进度存储：job_id → job dict。dev 态；进程重启即丢（续跑需 0023 ingest_jobs 表）。
_JOBS: dict[str, dict] = {}
_LOCK = threading.Lock()

# 五段真实边界（解析含识别·抽取·切块，一次原子调用，如实标一段，不拆假进度）
STAGES = ["落盘", "解析(识别·抽取·切块)", "入库索引", "归档抽图"]


def _now() -> float:
    return time.time()


def _set(job_id: str, **patch) -> None:
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job.update(patch)
            job["updated_at"] = _now()


def _event(job_id: str, **fields) -> None:
    """追加一条进度事件到 job 的事件队列（SSE 消费）。"""
    with _LOCK:
        job = _JOBS.get(job_id)
        if job is not None:
            job["events"].append({"t": _now(), **fields})


def get_job(job_id: str) -> Optional[dict]:
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def _group_by_source(paths: list[str]) -> dict[str, list[Path]]:
    """把选中的绝对路径（文件/文件夹混合）按来源文件夹归组，递归展开文件夹里的受支持文件。"""
    import os

    groups: dict[str, list[Path]] = {}
    _skip = {"_done", "_failed", "_trash", "_assets", "_ROMAI_CLEANUP_QUARANTINE"}
    for raw in paths:
        top = Path(raw)
        if not top.exists():
            continue
        if top.is_file():
            if parsing.is_supported(top.name):
                groups.setdefault(str(top.parent), []).append(top)
            continue
        for dirpath, dirnames, filenames in os.walk(top):
            dirnames[:] = [d for d in dirnames if d not in _skip]
            for fn in filenames:
                if parsing.is_supported(fn):
                    groups.setdefault(str(top), []).append(Path(dirpath) / fn)
    return groups


def _ingest_worker(job_id: str, paths: list[str]) -> None:
    """后台线程：逐文件跑五段。自建 DB 会话（不跨线程共享）。"""
    db = SessionLocal()
    try:
        groups = _group_by_source(paths)
        total = sum(len(fs) for fs in groups.values())
        _set(job_id, total=total, phase="running")
        _event(job_id, kind="start", total=total, groups=len(groups))

        done = imported = indexed = assets = skipped = failed = 0
        project_ids: set[int] = set()

        for source_dir, files in groups.items():
            # 项目关联：按来源文件夹去重建项（复用 _find_or_create_project，source_path 键）
            project = _find_or_create_project(db, Path(source_dir).name or source_dir, source_dir)
            project_ids.add(project.id)
            for f in files:
                done += 1
                fname = f.name
                _set(job_id, current_file=fname, file_index=done)
                try:
                    size = f.stat().st_size
                except OSError:
                    failed += 1
                    _event(job_id, kind="file", i=done, name=fname, stage="失败", reason="无法读取文件")
                    continue

                # 去重（同名同大小；content_hash 精确去重等 0023）
                if _already_imported(db, project.id, fname, size):
                    skipped += 1
                    _event(job_id, kind="file", i=done, name=fname, stage="已在库·跳过", skipped=True)
                    continue

                try:
                    # 段1 落盘（复制，不移动源文件）
                    _event(job_id, kind="stage", i=done, name=fname, stage=STAGES[0])
                    stored, storage_root = _store_file(db, project, f)

                    # 段2 解析（识别·抽取·切块，一次原子调用）
                    _event(job_id, kind="stage", i=done, name=fname, stage=STAGES[1])
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

                    # 段3 入库+索引（FTS5）
                    _event(job_id, kind="stage", i=done, name=fname, stage=STAGES[2])
                    if _index_project_file(db, pf):
                        indexed += 1

                    # 段4 归档抽图（大文件抽图失败降级：不阻断整批）
                    _event(job_id, kind="stage", i=done, name=fname, stage=STAGES[3])
                    try:
                        assets += _extract_and_store_assets(db, project, pf)
                    except Exception as ae:  # noqa: BLE001  抽图失败不致命，如实记，文件已入库
                        _event(job_id, kind="warn", i=done, name=fname, reason=f"抽图降级: {ae}")

                    # 单文件完成回执（chunk 数 + 截断诚实标注）
                    nchunks = len(pr.chunks) if pr.chunks else 0
                    _event(
                        job_id, kind="file", i=done, name=fname, stage="完成",
                        parse_status=pr.status, chunks=nchunks,
                        truncated_at_page=pr.truncated_at_page, total_pages=pr.total_pages,
                    )
                except Exception as exc:  # noqa: BLE001  单文件失败不阻断其它
                    db.rollback()
                    failed += 1
                    _event(job_id, kind="file", i=done, name=fname, stage="失败", reason=str(exc))

                _set(job_id, imported=imported, indexed=indexed, assets=assets, skipped=skipped, failed=failed)

        _set(job_id, phase="done", finished_at=_now(),
             imported=imported, indexed=indexed, assets=assets, skipped=skipped, failed=failed)
        _event(job_id, kind="done", imported=imported, indexed=indexed, assets=assets,
                skipped=skipped, failed=failed, project_ids=list(project_ids))

        # 归档全部完成 → 研判触发钩子（零·B2）：对每个项目排队跑一次现有 analyze（复用，不新造）。
        # 非阻塞：失败/未配 key 不影响入库回执，五段回执已在上面 done 事件给出。
        for pid in project_ids:
            _trigger_analysis(db, pid, job_id)
    finally:
        db.close()


def _trigger_analysis(db, project_id: int, job_id: str) -> None:
    """归档后触发一次 16 域研判（零·B2）。

    真实复用入口 = project_analysis.analyze 的核心三步（analysis.gather_material →
    structured_judgment.run_structured → 落 ProjectAnalysis，task='overview'，force=False 读缓存）。
    该端点带 FastAPI Depends，不宜在后台线程直接调；精确复用（抽公共函数或 httpx 自调）
    留到 S4.5 独立校准。本 S4 版只记事件、不阻断入库回执——五段回执已在 done 事件给出。
    """
    _event(job_id, kind="analysis", project_id=project_id, status="deferred",
            reason="研判触发钩子待 S4.5 精确复用 analyze(overview)；本版不阻断入库")


def start_ingest(paths: list[str]) -> str:
    """创建 job 并起后台线程，返回 job_id。"""
    job_id = uuid.uuid4().hex[:12]
    with _LOCK:
        _JOBS[job_id] = {
            "id": job_id, "phase": "queued", "total": 0, "file_index": 0,
            "current_file": "", "imported": 0, "indexed": 0, "assets": 0,
            "skipped": 0, "failed": 0, "events": [], "created_at": _now(), "updated_at": _now(),
        }
    threading.Thread(target=_ingest_worker, args=(job_id, paths), daemon=True).start()
    return job_id

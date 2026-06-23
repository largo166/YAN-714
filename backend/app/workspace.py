"""项目目录读取 + 安全清理引擎（Phase 4C）。

安全原则（铁律）：
- 永不永久删除。apply 仅把文件「移动」到隔离区 _ROMAI_CLEANUP_QUARANTINE/<时间戳>/。
- 每次 apply 写 manifest.json，记录 原路径/隔离路径/大小/原因/时间，支持 restore 还原。
- 自动可清理：.tmp .bak .log __pycache__ .DS_Store Thumbs.db 空文件 缓存目录 重复导出命名(copy/副本/备份/old)。
- 人工复核（绝不自动清理）：设计/模型/文档源文件 .psd .ai .skp .dwg .rvt .3dm .blend .max .pdf 图片 视频 office。
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from .safe_paths import PathValidationError, validate_path

QUARANTINE_DIRNAME = "_ROMAI_CLEANUP_QUARANTINE"

# 自动可清理扩展名 / 文件名
AUTO_CLEAN_EXTS = {".tmp", ".bak", ".log"}
AUTO_CLEAN_NAMES = {".ds_store", "thumbs.db"}
AUTO_CLEAN_DIRNAMES = {"__pycache__", ".cache", ".tmp"}
DUP_MARKERS = ["副本", "备份", " - copy", "(copy)", "_copy", "_old", " old", ".old"]

# 人工复核扩展名（绝不自动清理）
REVIEW_EXTS = {
    ".psd", ".ai", ".skp", ".dwg", ".rvt", ".3dm", ".blend", ".max",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff",
    ".mp4", ".mov", ".avi", ".mkv",
}


@dataclass
class FileEntry:
    path: str          # 相对项目根
    abs_path: str
    size: int
    mtime: str
    ext: str
    reason: str = ""   # 清理原因（仅清理候选）


@dataclass
class ScanResult:
    root: str
    accessible: bool
    total_files: int = 0
    total_dirs: int = 0
    total_size: int = 0
    type_stats: dict = field(default_factory=dict)
    recent_files: List[FileEntry] = field(default_factory=list)
    large_files: List[FileEntry] = field(default_factory=list)
    auto_cleanable: List[FileEntry] = field(default_factory=list)
    review_items: List[FileEntry] = field(default_factory=list)
    error: str = ""


def _is_quarantine(p: Path) -> bool:
    return QUARANTINE_DIRNAME in p.parts


def _entry(root: Path, p: Path, reason: str = "") -> FileEntry:
    try:
        st = p.stat()
        size, mtime = st.st_size, datetime.fromtimestamp(st.st_mtime).isoformat()
    except OSError:
        size, mtime = 0, ""
    return FileEntry(
        path=str(p.relative_to(root)),
        abs_path=str(p),
        size=size,
        mtime=mtime,
        ext=p.suffix.lower(),
        reason=reason,
    )


def _clean_reason(p: Path) -> Optional[str]:
    """返回自动可清理原因；None 表示不自动清理。"""
    name = p.name.lower()
    ext = p.suffix.lower()
    # 人工复核类优先排除
    if ext in REVIEW_EXTS:
        return None
    if any(parent.lower() in AUTO_CLEAN_DIRNAMES for parent in (x.name for x in p.parents)):
        return "位于缓存目录"
    if ext in AUTO_CLEAN_EXTS:
        return f"临时/日志文件 ({ext})"
    if name in AUTO_CLEAN_NAMES:
        return "系统残留文件"
    if any(m in name for m in DUP_MARKERS):
        return "疑似重复导出/备份命名"
    try:
        if p.stat().st_size == 0:
            return "空文件"
    except OSError:
        pass
    return None


def scan(root_path: str, *, large_threshold: int = 50 * 1024 * 1024) -> ScanResult:
    root = Path(root_path)
    if not root.exists() or not root.is_dir():
        return ScanResult(root=str(root), accessible=False, error="目录不存在或不可访问")

    res = ScanResult(root=str(root), accessible=True)
    all_files: List[FileEntry] = []
    try:
        for p in root.rglob("*"):
            if _is_quarantine(p):
                continue
            if p.is_dir():
                res.total_dirs += 1
                # 自动可清理目录（缓存）
                if p.name.lower() in AUTO_CLEAN_DIRNAMES:
                    res.auto_cleanable.append(_entry(root, p, "缓存目录"))
                continue
            if not p.is_file():
                continue
            res.total_files += 1
            e = _entry(root, p)
            res.total_size += e.size
            ext = e.ext or "(无扩展名)"
            res.type_stats[ext] = res.type_stats.get(ext, 0) + 1
            all_files.append(e)
            reason = _clean_reason(p)
            if reason:
                res.auto_cleanable.append(_entry(root, p, reason))
            elif e.ext in REVIEW_EXTS:
                res.review_items.append(e)
    except OSError as ex:
        res.error = str(ex)

    res.recent_files = sorted(all_files, key=lambda x: x.mtime, reverse=True)[:10]
    res.large_files = sorted(
        [f for f in all_files if f.size >= large_threshold], key=lambda x: x.size, reverse=True
    )[:10]
    # 人工复核列表限量返回
    res.review_items = sorted(res.review_items, key=lambda x: x.size, reverse=True)[:50]
    return res


def cleanup_preview(root_path: str) -> dict:
    """只扫描，不改文件。返回可清理候选 + 汇总。"""
    res = scan(root_path)
    if not res.accessible:
        return {"accessible": False, "error": res.error, "candidates": [], "total_size": 0}
    total = sum(c.size for c in res.auto_cleanable)
    return {
        "accessible": True,
        "root": res.root,
        "candidates": [c.__dict__ for c in res.auto_cleanable],
        "count": len(res.auto_cleanable),
        "total_size": total,
        "review_count": len(res.review_items),
        "note": "preview 只读，不移动任何文件。apply 仅移动到隔离区，可 restore。",
    }


def cleanup_apply(root_path: str, rel_paths: List[str]) -> dict:
    """把指定文件移动到隔离区，写 manifest。永不删除。"""
    root = Path(root_path)
    if not root.is_dir():
        return {"ok": False, "error": "目录不可访问"}

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    qroot = root / QUARANTINE_DIRNAME / ts
    qroot.mkdir(parents=True, exist_ok=True)

    manifest_items = []
    for rel in rel_paths:
        # 安全（统一 validate_path）：必在 root 内、拒 symlink 逃逸、必须存在
        try:
            src = validate_path(root, rel, must_exist=True)
        except PathValidationError:
            continue
        if _is_quarantine(src):
            continue
        reason = _clean_reason(src) or "用户选择"
        size = src.stat().st_size if src.is_file() else 0
        dst = qroot / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        manifest_items.append(
            {
                "original_path": str(src),
                "quarantine_path": str(dst),
                "rel": rel,
                "size": size,
                "reason": reason,
                "time": datetime.now().isoformat(),
            }
        )

    manifest = {"root": str(root), "timestamp": ts, "items": manifest_items}
    (qroot / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "quarantine": str(qroot), "moved": len(manifest_items), "manifest": manifest}


def cleanup_restore(root_path: str, timestamp: str) -> dict:
    """按 manifest 把隔离区文件还原回原位。"""
    root = Path(root_path)
    qroot = root / QUARANTINE_DIRNAME / timestamp
    mf = qroot / "manifest.json"
    if not mf.exists():
        return {"ok": False, "error": "manifest 不存在"}
    manifest = json.loads(mf.read_text(encoding="utf-8"))
    restored = 0
    for it in manifest["items"]:
        q = Path(it["quarantine_path"])
        orig = Path(it["original_path"])
        if q.exists():
            orig.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(q), str(orig))
            restored += 1
    return {"ok": True, "restored": restored, "total": len(manifest["items"])}

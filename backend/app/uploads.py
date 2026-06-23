"""项目上传文件落盘 + 可逆删除/恢复（Phase 4D）。

铁律：
- 上传根硬编码 = config.DATA_DIR / "uploads"（已 gitignore），不读用户可改目录，杜绝逃逸。
- 写盘必经 validate_path + sanitize_filename（P1 安全工具）。
- 删除永不硬删：移到 {pid}/_trash/{时间戳}/ 并写 manifest.json，可 restore（复用工作区可逆范式）。
- 只操作我方副本，绝不触碰用户原始路径 / 真实项目目录。
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .config import DATA_DIR
from .safe_paths import PathValidationError, sanitize_filename, validate_path

UPLOADS_ROOT = DATA_DIR / "uploads"
TRASH_DIRNAME = "_trash"


def _project_dir(project_id: int) -> Path:
    d = UPLOADS_ROOT / str(int(project_id))
    d.mkdir(parents=True, exist_ok=True)
    return d


@dataclass
class StoredFile:
    filename: str       # 净化后的最终文件名
    stored_path: str    # 相对 UPLOADS_ROOT 的路径
    abs_path: str
    size: int


def save_upload(project_id: int, original_name: str, data: bytes) -> StoredFile:
    """把上传字节写入 {pid}/{净化名}，重名加时间戳后缀。返回落点信息。"""
    pdir = _project_dir(project_id)
    safe_name = sanitize_filename(original_name)
    target = pdir / safe_name
    # 重名避让（不覆盖）
    if target.exists():
        stem = target.stem
        suffix = target.suffix
        ts = datetime.now().strftime("%H%M%S")
        safe_name = f"{stem}_{ts}{suffix}"
        target = pdir / safe_name

    # 写盘前白名单校验（防穿越/symlink）
    validate_path(UPLOADS_ROOT, target)
    target.write_bytes(data)

    return StoredFile(
        filename=safe_name,
        stored_path=str(target.relative_to(UPLOADS_ROOT)).replace("\\", "/"),
        abs_path=str(target),
        size=len(data),
    )


def copy_into_uploads(project_id: int, source_path: str | Path, original_name: str = "") -> StoredFile:
    """把本地文件复制到 {pid}/{净化名}，不移动原文件。适合批量接入大文件。"""
    src = Path(source_path)
    pdir = _project_dir(project_id)
    safe_name = sanitize_filename(original_name or src.name)
    target = pdir / safe_name
    if target.exists():
        stem = target.stem
        suffix = target.suffix
        ts = datetime.now().strftime("%H%M%S")
        safe_name = f"{stem}_{ts}{suffix}"
        target = pdir / safe_name

    validate_path(UPLOADS_ROOT, target)
    shutil.copy2(str(src), str(target))
    return StoredFile(
        filename=safe_name,
        stored_path=str(target.relative_to(UPLOADS_ROOT)).replace("\\", "/"),
        abs_path=str(target),
        size=target.stat().st_size,
    )


def abs_of(stored_path: str) -> Path:
    """把相对 stored_path 还原为校验过的绝对路径。"""
    return validate_path(UPLOADS_ROOT, stored_path)


def soft_delete(project_id: int, stored_path: str) -> dict:
    """移动到 {pid}/_trash/{时间戳}/ 并写 manifest。永不硬删。"""
    pdir = _project_dir(project_id)
    try:
        src = validate_path(UPLOADS_ROOT, stored_path, must_exist=True)
    except PathValidationError as e:
        return {"ok": False, "error": str(e)}

    ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    troot = pdir / TRASH_DIRNAME / ts
    troot.mkdir(parents=True, exist_ok=True)
    dst = troot / src.name
    shutil.move(str(src), str(dst))

    manifest = {
        "original_path": str(src),
        "trash_path": str(dst),
        "stored_path": stored_path,
        "time": datetime.now().isoformat(),
    }
    (troot / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "trash": str(troot), "manifest": manifest}


def restore(project_id: int, timestamp: str) -> dict:
    """按 manifest 把 _trash/{时间戳}/ 的文件还原回原位。"""
    pdir = _project_dir(project_id)
    troot = pdir / TRASH_DIRNAME / timestamp
    mf = troot / "manifest.json"
    if not mf.exists():
        return {"ok": False, "error": "manifest 不存在"}
    manifest = json.loads(mf.read_text(encoding="utf-8"))
    dst = Path(manifest["trash_path"])
    orig = Path(manifest["original_path"])
    if dst.exists():
        orig.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(dst), str(orig))
        return {"ok": True, "restored": manifest["stored_path"]}
    return {"ok": False, "error": "隔离文件不存在"}

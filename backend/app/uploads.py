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


def _norm(p: str | Path) -> Path:
    """绝对化 + resolve,作仓库根/嵌套判定的规范形式。"""
    return Path(p).expanduser().resolve()


def _reject_nested_with_uploads(root: Path) -> None:
    """拒绝仓库根 = uploads 自身 / 其祖先 / 其子孙(否则 _trash 与 uploads 树嵌套、cleanup 误删)。"""
    up = _norm(UPLOADS_ROOT)
    if root == up or root.is_relative_to(up) or up.is_relative_to(root):
        raise PathValidationError("仓库根不能是程序内部上传目录或其父/子目录,请另选一个独立文件夹")


def validate_repository_root(path: str) -> Path:
    """校验「用户仓库根」可作受管根:非空 / 绝对 / 存在 / 是目录 / 非 symlink / 可写 / 不与 uploads 嵌套。

    返回 resolve 后绝对 Path(供归一存库)。任一条不满足抛 PathValidationError(端点转 400)。
    与 validate_path 不同:这是校验「能否做根」,不是「target 是否落在某 base 内」。
    """
    if not path or not str(path).strip():
        raise PathValidationError("仓库路径为空")
    raw = Path(str(path).strip()).expanduser()
    if not raw.is_absolute():
        raise PathValidationError("请填写绝对路径(如 D:\\ROM-AI-仓库)")
    if raw.is_symlink():
        raise PathValidationError("仓库根不能是符号链接")
    if not raw.exists():
        raise PathValidationError("该文件夹不存在,请先在资源管理器里新建它")
    if not raw.is_dir():
        raise PathValidationError("该路径不是文件夹")
    root = raw.resolve()
    _reject_nested_with_uploads(root)
    # 可写探针:建一个临时子目录再删,确认有写权限(fail closed)
    probe = root / ".romai_write_probe"
    try:
        probe.mkdir(exist_ok=True)
        probe.rmdir()
    except OSError as e:
        raise PathValidationError(f"仓库文件夹不可写:{e}")
    return root



def managed_root(repository_root_path: str = "") -> Path:
    """受管根:配置了仓库则用仓库根,否则回退程序内部 UPLOADS_ROOT。

    db 依赖在路由层解析后把字符串传进来,保持本模块纯函数、可测、无循环依赖。
    """
    p = (repository_root_path or "").strip()
    if p:
        return Path(p)
    return UPLOADS_ROOT


def _unit_dir(base_root: Path, subdir: str) -> Path:
    """受管根下的项目单元目录 {base_root}/{sanitize(subdir)}/,自动创建。"""
    d = base_root / sanitize_filename(subdir)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _project_dir(project_id: int) -> Path:
    """回退布局的项目目录 {UPLOADS_ROOT}/{pid}/(向后兼容,薄封装 _unit_dir)。"""
    return _unit_dir(UPLOADS_ROOT, str(int(project_id)))


@dataclass
class StoredFile:
    filename: str       # 净化后的最终文件名
    stored_path: str    # 相对受管根的路径(回退="6/x.pdf";仓库="项目名/x.pdf")
    abs_path: str
    size: int


def _avoid_clobber(target: Path) -> tuple[Path, str]:
    """重名避让(不覆盖):存在则文件名加时间戳后缀。返回 (最终 target, 最终文件名)。"""
    if not target.exists():
        return target, target.name
    ts = datetime.now().strftime("%H%M%S")
    name = f"{target.stem}_{ts}{target.suffix}"
    return target.with_name(name), name


def copy_into_root(
    base_root: Path, subdir: str, source_path: str | Path, original_name: str = ""
) -> StoredFile:
    """把本地文件复制到 {base_root}/{subdir}/{净化名}，不移动原文件。受管根通用版。"""
    src = Path(source_path)
    udir = _unit_dir(base_root, subdir)
    safe_name = sanitize_filename(original_name or src.name)
    target, safe_name = _avoid_clobber(udir / safe_name)

    validate_path(base_root, target)
    shutil.copy2(str(src), str(target))
    return StoredFile(
        filename=safe_name,
        stored_path=str(target.relative_to(base_root)).replace("\\", "/"),
        abs_path=str(target),
        size=target.stat().st_size,
    )


def write_into_root(
    base_root: Path, subdir: str, original_name: str, data: bytes
) -> StoredFile:
    """把上传字节写入 {base_root}/{subdir}/{净化名}，重名加后缀。受管根通用版。"""
    udir = _unit_dir(base_root, subdir)
    safe_name = sanitize_filename(original_name)
    target, safe_name = _avoid_clobber(udir / safe_name)

    validate_path(base_root, target)
    target.write_bytes(data)
    return StoredFile(
        filename=safe_name,
        stored_path=str(target.relative_to(base_root)).replace("\\", "/"),
        abs_path=str(target),
        size=len(data),
    )


def save_upload(project_id: int, original_name: str, data: bytes) -> StoredFile:
    """回退布局上传(薄封装):写入 {UPLOADS_ROOT}/{pid}/{净化名}。行为同旧。"""
    return write_into_root(UPLOADS_ROOT, str(int(project_id)), original_name, data)


def copy_into_uploads(project_id: int, source_path: str | Path, original_name: str = "") -> StoredFile:
    """回退布局复制(薄封装):复制到 {UPLOADS_ROOT}/{pid}/{净化名}。行为同旧。"""
    return copy_into_root(UPLOADS_ROOT, str(int(project_id)), source_path, original_name)


def _root_of(storage_root: str = "") -> Path:
    """据行的 storage_root 取还原 base:空=历史/回退行→ UPLOADS_ROOT;否则用该绝对根。"""
    s = (storage_root or "").strip()
    return Path(s) if s else UPLOADS_ROOT


def abs_of(stored_path: str, storage_root: str = "") -> Path:
    """把相对 stored_path 还原为校验过的绝对路径(据 storage_root 选 base)。"""
    return validate_path(_root_of(storage_root), stored_path)


def soft_delete(stored_path: str, storage_root: str = "") -> dict:
    """移动到 {单元目录}/_trash/{时间戳}/ 并写 manifest。永不硬删。

    单元目录从 stored_path 首段推出(回退={root}/{pid};仓库={root}/{项目名}),
    使 _trash 与文件同在一个单元目录下,布局两种皆正确。
    """
    base = _root_of(storage_root)
    try:
        src = validate_path(base, stored_path, must_exist=True)
    except PathValidationError as e:
        return {"ok": False, "error": str(e)}

    rel = Path(str(stored_path).replace("\\", "/"))
    unit_dir = base / (rel.parts[0] if rel.parts else "")
    ts = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    troot = unit_dir / TRASH_DIRNAME / ts
    troot.mkdir(parents=True, exist_ok=True)
    dst = troot / src.name
    shutil.move(str(src), str(dst))

    manifest = {
        "original_path": str(src),
        "trash_path": str(dst),
        "stored_path": stored_path,
        "storage_root": str(base),
        "time": datetime.now().isoformat(),
    }
    (troot / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "trash": str(troot), "manifest": manifest}


def restore(timestamp: str, storage_root: str = "", *, stored_path: str = "") -> dict:
    """按 manifest 把 _trash/{时间戳}/ 的文件还原回原位(据 storage_root + stored_path 定位单元)。"""
    base = _root_of(storage_root)
    rel = Path(str(stored_path).replace("\\", "/"))
    unit_dir = base / (rel.parts[0] if rel.parts else "")
    troot = unit_dir / TRASH_DIRNAME / timestamp
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

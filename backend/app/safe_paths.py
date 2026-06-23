"""统一路径安全校验（P1 红线）。

纲要红线 validate_path：
  resolve → 白名单 is_relative_to → 拒绝 symlink 逃逸 → 空目录 fail closed → 文件名净化。

设计要点：
- 所有写盘/移动/删除的目标路径必经此关，杜绝目录穿越与符号链接逃逸。
- base 为空 / 不存在 / 不是目录 → fail closed（抛 PathValidationError，绝不退化为放行 cwd）。
- symlink 检测显式遍历目标及各级父目录的 is_symlink()，不依赖 resolve() 比较
  （resolve() 会跟随符号链接，relative_to 通过 ≠ 未逃逸）。
- 不要求 target 已存在（上传写盘时父目录在 base 内、文件名净化即可）。
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Optional

__all__ = ["PathValidationError", "validate_path", "sanitize_filename"]


class PathValidationError(ValueError):
    """路径未通过安全校验。"""


# Windows 保留字符 + 控制字符；路径分隔符单独处理
_ILLEGAL_NAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_RESERVED_WIN = {
    "con", "prn", "aux", "nul",
    *(f"com{i}" for i in range(1, 10)),
    *(f"lpt{i}" for i in range(1, 10)),
}


def sanitize_filename(name: str, *, fallback: str = "untitled") -> str:
    """把单个文件名净化为安全形式（不含路径分隔符 / 穿越 / 保留字）。

    仅用于文件名（不是路径）。剥离目录成分、非法字符、首尾点和空格。
    """
    # 只取最后一段，杜绝传入 "a/b" 或 "..\\x" 把目录带进来
    name = name.replace("\\", "/").split("/")[-1]
    name = _ILLEGAL_NAME_CHARS.sub("_", name).strip().strip(".")
    if not name or set(name) <= {"."}:
        return fallback
    stem = name.split(".")[0].lower()
    if stem in _RESERVED_WIN:
        name = "_" + name
    return name[:255]


def _has_symlink_component(path: Path, *, stop_at: Path) -> bool:
    """目标自身或其位于 base 内的任一父目录是否为 symlink。

    从 path 向上走到 stop_at（含 path、不含 stop_at），任一段 is_symlink 即判逃逸。
    不存在的中间段不是 symlink，跳过即可。
    """
    cur = path
    try:
        stop_resolved = stop_at.resolve()
    except OSError:
        stop_resolved = stop_at
    seen = 0
    while True:
        if cur.is_symlink():
            return True
        parent = cur.parent
        # 到达 base 边界或文件系统根即停
        if parent == cur:
            break
        try:
            if parent.resolve() == stop_resolved:
                break
        except OSError:
            pass
        cur = parent
        seen += 1
        if seen > 256:  # 防御异常深度
            break
    return False


def validate_path(base: str | Path, target: str | Path, *, must_exist: bool = False) -> Path:
    """校验 target 落在 base 白名单内且无 symlink 逃逸，返回 resolve 后的安全 Path。

    Args:
        base: 白名单根目录。空 / 不存在 / 非目录 → fail closed。
        target: 待校验路径，可为相对（相对 base）或绝对。
        must_exist: True 时 target 必须已存在，否则拒绝。

    Raises:
        PathValidationError: 任一安全条件不满足。
    """
    # ① base fail closed
    if base is None or str(base).strip() == "":
        raise PathValidationError("base 为空，拒绝（fail closed）")
    base_path = Path(base)
    if not base_path.exists() or not base_path.is_dir():
        raise PathValidationError(f"base 不存在或非目录，拒绝（fail closed）: {base}")
    base_resolved = base_path.resolve()

    # ② 组装 target（相对则相对 base）
    t = Path(target)
    candidate = t if t.is_absolute() else (base_resolved / t)

    # ③ symlink 逃逸检测（在 resolve 之前，针对真实路径段）
    if _has_symlink_component(candidate, stop_at=base_resolved):
        raise PathValidationError(f"目标路径含符号链接，拒绝: {target}")

    # ④ resolve 后白名单校验（is_relative_to 为 3.9+ 可用）
    resolved = candidate.resolve()
    if resolved != base_resolved and not resolved.is_relative_to(base_resolved):
        raise PathValidationError(f"目标越出白名单根，拒绝: {target}")

    # ⑤ 存在性
    if must_exist and not resolved.exists():
        raise PathValidationError(f"目标不存在: {target}")

    return resolved

"""只读「列目录」API:给前端目录选择弹窗用(本应用非 Electron,浏览器拿不到文件夹绝对路径)。

铁律:
- 纯只读浏览——只 iterdir() 读,绝不创建/移动/删除任何文件,不写盘。
- 不过 validate_path(那是写入白名单校验);列目录是只读,本就不需要。
- 优雅降级:不存在/无权限 → accessible=false + error,不抛 500;单子项 stat 失败跳过不阻断。
"""
from __future__ import annotations

import platform
import string
from pathlib import Path

from fastapi import APIRouter

from .. import parsing, schemas

router = APIRouter(prefix="/api/filesystem", tags=["filesystem"])

QUARANTINE_DIRNAME = "_ROMAI_CLEANUP_QUARANTINE"
TRASH_DIRNAME = "_trash"
_HIDDEN = {QUARANTINE_DIRNAME, TRASH_DIRNAME}


def _list_drives() -> list[str]:
    """Windows: 探测 A-Z 存在的盘符(如 'C:\\');非 Windows: 返回 ['/']。"""
    if platform.system() == "Windows":
        out: list[str] = []
        for letter in string.ascii_uppercase:
            d = f"{letter}:\\"
            if Path(d).exists():
                out.append(d)
        return out
    return ["/"]


def _common_locations() -> list["schemas.DirEntryOut"]:
    """盘符层的常用位置快捷入口(桌面/文档/下载/主目录),只返回真实存在的目录。

    免去用户逐层点进 C:\\Users\\<用户>\\Desktop。桌面优先标准路径,
    其次 OneDrive 重定向(很多 Win 机桌面被重定向到 OneDrive\\Desktop)。
    """
    home = Path.home()
    out: list[schemas.DirEntryOut] = []

    def add(label: str, p: Path) -> None:
        try:
            if p.is_dir() and all(o.abs_path != str(p) for o in out):
                out.append(schemas.DirEntryOut(name=label, abs_path=str(p), is_dir=True))
        except OSError:
            pass

    desk = home / "Desktop"
    if not desk.is_dir():
        desk = home / "OneDrive" / "Desktop"
    add("🖥 桌面", desk)
    add("📄 文档", home / "Documents")
    add("⬇ 下载", home / "Downloads")
    add("🏠 用户主目录", home)
    return out


def _entry(p: Path) -> schemas.DirEntryOut | None:
    """把一个子项封装为 DirEntryOut;stat/访问失败返回 None(跳过不阻断)。"""
    try:
        is_dir = p.is_dir()
    except OSError:
        return None
    if p.name in _HIDDEN:
        return None
    ext = "" if is_dir else p.suffix.lower()
    return schemas.DirEntryOut(
        name=p.name,
        abs_path=str(p),
        is_dir=is_dir,
        ext=ext,
        # 文件:能否被整理链路解析(图纸/图片算资产登记,也算 supported);文件夹恒 False
        supported=(not is_dir) and parsing.is_supported(p.name),
        is_symlink=p.is_symlink(),
    )


@router.get("/list-dir", response_model=schemas.DirListOut)
def list_dir(path: str = "") -> schemas.DirListOut:
    """列出某目录的直接子级(不递归);path 为空 → 返回盘符列表。"""
    path = (path or "").strip()

    # 盘符层(初始/根):盘符 + 常用位置快捷入口(桌面/文档/下载/主目录)
    if not path:
        return schemas.DirListOut(
            accessible=True, level="drives", path="", parent=None,
            drives=_list_drives(), shortcuts=_common_locations(), items=[],
        )

    root = Path(path)
    try:
        if not root.exists():
            return schemas.DirListOut(accessible=False, level="dir", path=path, error="路径不存在")
        if not root.is_dir():
            return schemas.DirListOut(accessible=False, level="dir", path=path, error="不是文件夹")
    except OSError as e:  # 无权限等
        return schemas.DirListOut(accessible=False, level="dir", path=path, error=f"无法访问:{e}")

    items: list[schemas.DirEntryOut] = []
    try:
        for p in root.iterdir():
            e = _entry(p)
            if e is not None:
                items.append(e)
    except OSError as e:
        return schemas.DirListOut(accessible=False, level="dir", path=str(root), error=f"无法读取目录:{e}")

    # 文件夹在前、各按名(不区分大小写)排序;父目录(到盘符根时 parent=None)
    items.sort(key=lambda x: (not x.is_dir, x.name.lower()))
    parent = None if root.parent == root else str(root.parent)
    return schemas.DirListOut(
        accessible=True, level="dir", path=str(root), parent=parent,
        drives=[], items=items,
    )

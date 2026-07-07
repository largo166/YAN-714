"""项目命名/来源守卫（块2·B，2026-07-07）。

纯函数,无 DB/IO 依赖(除盘符判断),可被 ingest / staging / 未来 API 共用——
守卫写在后端入口,防前端之外的入口(inbox 扫描、API)绕过建出脏项目。

背景:项目名 = 所选文件夹名(_find_or_create_project)。历史上因无守卫,
选了仓库根/桌面深层编号目录 → 建出「数据基地」「01_项目资料」等脏项目。

- reject_as_project: 硬拒绝(仓库根本身 / 系统特殊目录 / 盘符根)。命中 → ingest 整批拒绝并报明确错误。
- warn_as_project: 软警示(编号前缀 / 通用词单独成名)。命中 → staging 标黄提示,不拦(总有真项目叫怪名字,决定权在人)。
"""
from __future__ import annotations

import os
import re
from pathlib import Path


def _norm(p: str | Path) -> str:
    """路径归一:绝对化 + 平台大小写归一(与 _find_or_create_project 同键)。"""
    try:
        return os.path.normcase(os.path.abspath(str(p)))
    except OSError:
        return os.path.normcase(str(p))


# 系统/用户特殊目录名(作为项目根不合理:它们是容器不是项目)
_SYSTEM_DIR_NAMES = {
    "desktop", "downloads", "documents", "pictures", "music", "videos",
    "桌面", "下载", "文档", "图片", "音乐", "视频",
    "onedrive", "appdata", "program files", "program files (x86)", "windows", "users",
}

# 编号前缀模式:短序号 01_ 02- 1. 3、(1-3 位数字 + 分隔符/空格),多半是项目内部编号目录。
# 特意排除长数字串(≥4 位,多为日期 20260318- / 年份),避免误伤"日期命名的真项目"。
_NUM_PREFIX = re.compile(r"^\s*\d{1,3}\s*[_\-\.、\s]")

# 通用词单独成名(不是具体项目名,像内部目录)
_GENERIC_NAMES = {
    "项目资料", "基础资料", "资料", "文件", "素材", "文档", "附件", "数据",
    "project", "data", "files", "assets", "docs", "materials", "temp", "tmp",
    "新建文件夹", "未命名",
}


def reject_as_project(source_path: str | Path, repo_root: str | Path | None = None) -> str | None:
    """硬拒绝该路径作为项目根;返回错误文案(命中)或 None(通过)。

    拒绝:① 仓库根本身 ② 盘符根(c:\\) ③ 系统/用户特殊目录(desktop/users/... 顶层)。
    """
    p = Path(str(source_path))
    norm = _norm(p)

    # ① 仓库根本身不能当项目(入库落点,不是项目)
    if repo_root:
        if norm == _norm(repo_root):
            return "不能把「仓库根目录」本身作为项目——请选择项目文件夹,或包含多个项目的父目录。"

    # ② 盘符根 / 无父目录
    parent = p.parent
    if parent == p or not p.name:
        return "不能把「磁盘根目录」作为项目——请选择具体的项目文件夹。"

    # ③ 系统/用户特殊目录
    if p.name.strip().lower() in _SYSTEM_DIR_NAMES:
        return f"「{p.name}」是系统目录,不能作为项目——请选择其下具体的项目文件夹,或包含项目的父目录。"

    return None


def warn_as_project(name: str) -> str | None:
    """软警示该文件夹名可能不是真项目;返回提示文案(命中)或 None。不拦,仅前端标黄。"""
    n = (name or "").strip()
    if not n:
        return None
    if _NUM_PREFIX.match(n):
        return "这个名字像「项目内部的编号目录」(如 01_/02_),确认要作为一个独立项目吗?"
    if n.lower() in _GENERIC_NAMES:
        return "这个名字是通用词,像「项目内部目录」而非具体项目名,确认要作为一个独立项目吗?"
    return None

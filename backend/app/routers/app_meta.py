"""应用版本/构建信息(前后端一致性自检)。

前端启动时比对:
- backend_version:后端语义版本(app.version)。
- dist_hash:后端【实际托管的 dist】里入口 JS 的哈希(从 seasky.html 解析 main-XXXX.js)。
  前端读自己加载的 main-XXXX.js 哈希与之比对——不一致=浏览器跑的前端 ≠ 后端托管的前端(需重 build/刷新)。
  后端未托管 dist(纯开发跑)时 dist_hash 为 null,前端跳过版本比对(只做连接检查)。
"""
from __future__ import annotations

import re
from fastapi import APIRouter

from ..config import frontend_dist_dir

router = APIRouter(prefix="/api/app", tags=["app-meta"])

_BACKEND_VERSION = "0.2.0"


def _served_dist_hash() -> str | None:
    """从后端实际托管的 seasky.html 解析入口 JS 哈希(main-XXXX.js → XXXX)。无 dist/解析不到=None。"""
    try:
        html = (frontend_dist_dir() / "seasky.html").read_text(encoding="utf-8")
    except OSError:
        return None
    m = re.search(r"main-([A-Za-z0-9_-]+)\.js", html)
    return m.group(1) if m else None


@router.get("/version")
def app_version() -> dict:
    """前后端一致性自检信息。dist_hash=后端托管前端的入口哈希(前端据此判断自身是否过期)。"""
    return {
        "backend_version": _BACKEND_VERSION,
        "dist_hash": _served_dist_hash(),
    }

"""库完整性体检 · 真实落盘口径的单一事实(2026-07-07)。

四态体检:记录在·文件在 / 记录在·文件丢 / 文件在·记录无(孤儿) / root 脱节(不存在🔴/空置🟡)。
路径解析**统一调 uploads.abs_of**(记录→物理绝对路径,据 storage_root 选 base,空→uploads),
不自己拼接——只有一份口径(踩坑教训:手写拼接会拼错 base 误报"全丢")。纯只读,不改库。

根级判定优先于文件级:某 storage_root 目录不存在/空置且有存量记录 → 整根标脱节,
不再逐条报"文件丢"(系统性脱节与零星丢失分开)。
"""
from __future__ import annotations

import os
from pathlib import Path

from . import models, uploads
from .safe_paths import PathValidationError


def resolve_physical(stored_path: str, storage_root: str = "") -> Path | None:
    """记录 → 物理绝对路径(单一口径,调 uploads.abs_of)。解析失败(如根非法)返回 None。"""
    try:
        return uploads.abs_of(stored_path or "", storage_root or "")
    except (PathValidationError, OSError, ValueError):
        return None


def _root_dir(storage_root: str) -> Path:
    """该 storage_root 的实际根目录(空→uploads),用于根级脱节判定。"""
    s = (storage_root or "").strip()
    return Path(s) if s else uploads.UPLOADS_ROOT


def _root_state(root: Path) -> str:
    """根级状态:missing(不存在)🔴 / empty(存在但空)🟡 / ok(存在且有内容)。"""
    try:
        if not root.exists():
            return "missing"
        if not root.is_dir():
            return "missing"
        return "empty" if next(os.scandir(root), None) is None else "ok"
    except OSError:
        return "missing"


def check_library(db) -> dict:
    """全库四态体检。返回汇总计数(全量真值,不截断)+ 按 root 分组 + 各态明细(调用方分页)。"""
    rows = list(
        db.query(
            models.ProjectFile.id, models.ProjectFile.project_id, models.ProjectFile.filename,
            models.ProjectFile.stored_path, models.ProjectFile.storage_root,
        ).filter(models.ProjectFile.status == "active").all()
    )

    # 先按 storage_root 分组、判根级状态(根级脱节优先)
    roots: dict[str, dict] = {}
    for _id, _pid, _fn, _sp, sr in rows:
        key = (sr or "").strip()
        if key not in roots:
            rd = _root_dir(key)
            roots[key] = {"storage_root": key or "(空·回退uploads)", "dir": str(rd),
                          "root_state": _root_state(rd), "record_count": 0}
        roots[key]["record_count"] += 1

    ok = missing = detached = 0
    missing_detail: list[dict] = []
    detached_detail: list[dict] = []  # 根脱节导致的受影响记录(不逐条塞 missing_detail)

    for _id, pid, fn, sp, sr in rows:
        key = (sr or "").strip()
        rstate = roots[key]["root_state"]
        if rstate in ("missing", "empty"):
            # 根脱节:整根受影响(empty 且有记录=文件该在而不在,也算脱节)
            detached += 1
            if len(detached_detail) < 200:
                detached_detail.append({"id": _id, "project_id": pid, "filename": fn,
                                        "storage_root": key or "", "root_state": rstate})
            continue
        # 根正常 → 逐条判文件在否
        phys = resolve_physical(sp, sr)
        if phys is not None and phys.exists():
            ok += 1
        else:
            missing += 1
            if len(missing_detail) < 200:
                missing_detail.append({"id": _id, "project_id": pid, "filename": fn,
                                       "expected_path": str(phys) if phys else "(解析失败)"})

    # 孤儿:根正常的目录下,有物理文件但无活动记录。只扫 root 正常的根(脱节根没法扫)。
    orphan = 0
    orphan_detail: list[dict] = []
    known_abs = set()
    for _id, _pid, _fn, sp, sr in rows:
        p = resolve_physical(sp, sr)
        if p is not None:
            known_abs.add(str(p).lower())
    for key, info in roots.items():
        if info["root_state"] != "ok":
            continue
        rd = Path(info["dir"])
        try:
            for dp, dns, fns in os.walk(rd):
                dns[:] = [d for d in dns if d not in ("_trash", "_assets", "_done", "_failed")]
                for f in fns:
                    ap = str(Path(dp) / f).lower()
                    if ap not in known_abs:
                        orphan += 1
                        if len(orphan_detail) < 200:
                            orphan_detail.append({"path": str(Path(dp) / f)})
        except OSError:
            pass

    return {
        "total_records": len(rows),
        # 汇总计数——全量真值,永不因明细上限而说谎
        "counts": {"ok": ok, "missing": missing, "detached": detached, "orphan": orphan},
        "roots": sorted(roots.values(), key=lambda r: r["storage_root"]),
        "root_detached": [r for r in roots.values() if r["root_state"] in ("missing", "empty") and r["record_count"] > 0],
        # 明细:默认前 200,带 total,调用方可分页
        "missing_detail": missing_detail, "missing_total": missing,
        "detached_detail": detached_detail, "detached_total": detached,
        "orphan_detail": orphan_detail, "orphan_total": orphan,
    }

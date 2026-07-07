"""块3 第1段 · 确定性清洗(dry-run 预演优先)。2026-07-07。

裁决(docs/decisions/项目识别修复与存量清洗.md 块3):
- 去重合并:同名副本只留一份,副本软删记日志。
  ⚠️ 无 content_hash 字段(0023 未做),故用「归一文件名(剥 _\\d{6} 时间戳后缀) + size」判重,最保守。
- 删 17「襄阳资料」(测试建)。
- 12→襄阳-国投-建华望府、13→昆明-览悦(改名)。
- 14→未归类-收件箱堆积、16→未归类-桌面01目录(止血改名)。

默认 DRY-RUN:只报「将删/将改」清单,不动库。加 --apply 才真执行(先备份 DB)。
软删=status='archived_dedup'/'archived_deleted'(可回溯),不物删。所有动作写日志。
"""
from __future__ import annotations

import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone

DB = "data/rom_ai.db"
APPLY = "--apply" in sys.argv
LOG = "../.tmp_run_logs/cleanup_actions.log"

RENAME = {12: "襄阳-国投-建华望府", 13: "昆明-览悦", 14: "未归类-收件箱堆积", 16: "未归类-桌面01目录"}
DELETE_PROJECTS = [17]

_TS_SUFFIX = re.compile(r"_\d{6}$")  # inbox 副本时间戳后缀 _030610


def _norm_name(fn: str) -> str:
    """归一文件名用于判重:剥扩展名前的 _\\d{6} 时间戳后缀。"""
    stem, dot, ext = fn.rpartition(".")
    if not dot:
        stem, ext = fn, ""
    stem = _TS_SUFFIX.sub("", stem)
    return (stem + ("." + ext if ext else "")).lower()


def _log(lines: list[str]) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    with open(LOG, "a", encoding="utf-8") as f:
        for ln in lines:
            f.write("%s  %s\n" % (ts, ln))


def main() -> None:
    c = sqlite3.connect(DB)
    c.text_factory = str
    report: list[str] = []

    # ── 去重预演:每个项目内,归一名+size 相同的多份,保留 id 最小的,其余标记 ──
    dedup_targets: list[tuple[int, int, str]] = []  # (file_id, project_id, filename)
    for (pid,) in c.execute("select id from projects where status='active'"):
        seen: dict[tuple[str, int], int] = {}
        for fid, fn, size in c.execute(
            "select id,filename,size from project_files where project_id=? and status='active' order by id", (pid,)
        ):
            key = (_norm_name(fn), size or 0)
            if key in seen:
                dedup_targets.append((fid, pid, fn))  # 已见过 → 副本,标记
            else:
                seen[key] = fid
    report.append("【去重】将软删 %d 个副本(同项目内 归一名+size 重复,保留最早一份)" % len(dedup_targets))

    # ── 删项目 17 预演 ──
    for pid in DELETE_PROJECTS:
        row = c.execute("select name,(select count(*) from project_files where project_id=? and status='active') from projects where id=?", (pid, pid)).fetchone()
        if row:
            report.append("【删项目】id=%d「%s」(其下 %d 活动文件一并软删)" % (pid, row[0], row[1]))

    # ── 改名预演 ──
    for pid, newname in RENAME.items():
        row = c.execute("select name from projects where id=?", (pid,)).fetchone()
        if row:
            report.append("【改名】id=%d「%s」→「%s」" % (pid, row[0], newname))

    print("\n".join(report))
    print("\n去重明细(前 40 条):")
    for fid, pid, fn in dedup_targets[:40]:
        print("   proj %d  file#%d  %s" % (pid, fid, fn))
    if len(dedup_targets) > 40:
        print("   …另 %d 条" % (len(dedup_targets) - 40))

    if not APPLY:
        print("\n[DRY-RUN] 未改库。确认无误后加 --apply 执行(会先备份 DB)。")
        return

    # ── 真执行:先备份 ──
    backup = "data/rom_ai.before_cleanup.%s.db" % datetime.now().strftime("%Y%m%d-%H%M%S")
    shutil.copy(DB, backup)
    logs = ["=== 清洗执行 备份=%s ===" % backup]
    for fid, pid, fn in dedup_targets:
        c.execute("update project_files set status='archived_dedup' where id=?", (fid,))
        logs.append("dedup archived file#%d proj%d %s" % (fid, pid, fn))
    for pid in DELETE_PROJECTS:
        c.execute("update project_files set status='archived_deleted' where project_id=? and status='active'", (pid,))
        c.execute("update projects set status='archived' where id=?", (pid,))
        logs.append("delete project %d (+files archived)" % pid)
    for pid, newname in RENAME.items():
        c.execute("update projects set name=? where id=?", (newname, pid))
        logs.append("rename project %d -> %s" % (pid, newname))
    c.commit()
    _log(logs)
    print("\n[APPLIED] 已执行,DB 备份 %s,日志 %s" % (backup, LOG))
    print("去重软删 %d、删项目 %d、改名 %d" % (len(dedup_targets), len(DELETE_PROJECTS), len(RENAME)))


if __name__ == "__main__":
    main()

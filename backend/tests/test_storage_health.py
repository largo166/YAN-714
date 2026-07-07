"""库完整性体检回归守卫(2026-07-07)。一病一健对照:
- 健:临时库,记录物理文件都在 → 全 ok;
- 病:构造 root 脱节(storage_root 指向不存在目录)+ 文件丢 → 分别报 detached / missing。
真实落盘口径统一走 storage_probe(调 uploads.abs_of),此测试锁住四态判定不漂移。"""
import os
import tempfile
from pathlib import Path

from app import storage_probe


class FakeRow:
    """轻量假 ProjectFile 行(避开建库),storage_probe.check_library 只读这几个字段。"""
    def __init__(self, i, pid, fn, sp, sr, status="active"):
        self.id, self.project_id, self.filename = i, pid, fn
        self.stored_path, self.storage_root, self.status = sp, sr, status


class FakeQuery:
    def __init__(self, rows): self._rows = rows
    def filter(self, *a, **k): return self
    def all(self): return [(r.id, r.project_id, r.filename, r.stored_path, r.storage_root) for r in self._rows]


class FakeDB:
    def __init__(self, rows): self._rows = rows
    def query(self, *a, **k): return FakeQuery(self._rows)


def test_healthy_all_ok(tmp_path):
    """记录物理文件都在(用绝对 storage_root=tmp)→ 全 ok。"""
    root = tmp_path / "repo"
    (root / "proj").mkdir(parents=True)
    (root / "proj" / "a.txt").write_text("x", encoding="utf-8")
    rows = [FakeRow(1, 1, "a.txt", "proj/a.txt", str(root))]
    r = storage_probe.check_library(FakeDB(rows))
    assert r["counts"]["ok"] == 1
    assert r["counts"]["missing"] == 0 and r["counts"]["detached"] == 0


def test_root_detached_missing(tmp_path):
    """storage_root 指向不存在目录 + 有记录 → 整根 detached(不逐条报 missing)。"""
    dead = str(tmp_path / "已迁走的仓库根")  # 不创建=不存在
    rows = [FakeRow(1, 1, "a.txt", "proj/a.txt", dead), FakeRow(2, 1, "b.txt", "proj/b.txt", dead)]
    r = storage_probe.check_library(FakeDB(rows))
    assert r["counts"]["detached"] == 2 and r["counts"]["missing"] == 0
    assert len(r["root_detached"]) == 1 and r["root_detached"][0]["root_state"] == "missing"


def test_root_empty_with_records_is_detached(tmp_path):
    """root 存在但为空 + 有记录 → 🟡 空置按脱节(文件该在而不在)。"""
    empty_root = tmp_path / "空仓库根"
    empty_root.mkdir()
    rows = [FakeRow(1, 1, "a.txt", "proj/a.txt", str(empty_root))]
    r = storage_probe.check_library(FakeDB(rows))
    assert r["counts"]["detached"] == 1
    assert r["root_detached"][0]["root_state"] == "empty"


def test_missing_file_under_live_root(tmp_path):
    """root 正常但个别文件丢 → missing(不是 detached)。"""
    root = tmp_path / "repo"
    (root / "proj").mkdir(parents=True)
    (root / "proj" / "here.txt").write_text("x", encoding="utf-8")  # 只建 here,gone 不建
    rows = [FakeRow(1, 1, "here.txt", "proj/here.txt", str(root)),
            FakeRow(2, 1, "gone.txt", "proj/gone.txt", str(root))]
    r = storage_probe.check_library(FakeDB(rows))
    assert r["counts"]["ok"] == 1 and r["counts"]["missing"] == 1 and r["counts"]["detached"] == 0
    assert r["missing_total"] == 1


def test_counts_are_full_even_if_detail_capped(tmp_path):
    """汇总计数全量真值,不因明细上限(200)截断——数字不许说谎。"""
    dead = str(tmp_path / "dead")
    rows = [FakeRow(i, 1, "f%d.txt" % i, "proj/f%d.txt" % i, dead) for i in range(250)]
    r = storage_probe.check_library(FakeDB(rows))
    assert r["counts"]["detached"] == 250            # 计数全量
    assert r["detached_total"] == 250
    assert len(r["detached_detail"]) == 200          # 明细上限 200


def test_death_lib_standard_if_present():
    """病人标本:归档死库(若在)应报大规模脱节。用真 DB session。"""
    import glob
    dbs = glob.glob("data/archived-devlib-*/rom_ai.db")
    if not dbs:
        return  # 归档不在(如别机)则跳过,不硬失败
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    db = sessionmaker(bind=create_engine("sqlite:///" + dbs[0].replace(os.sep, "/")))()
    try:
        r = storage_probe.check_library(db)
        assert r["total_records"] > 100
        assert r["counts"]["detached"] > 0            # 死库必有脱节
        assert len(r["root_detached"]) >= 1
    finally:
        db.close()

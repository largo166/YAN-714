"""4C 测试：workspace 目录扫描 + 安全清理（apply/restore 只在临时目录）。

铁律验证：apply 不删除、只移动到隔离区；restore 能还原；人工复核类不进自动清理。
"""
from pathlib import Path

from app import workspace


def _make_project(tmp_path: Path) -> Path:
    root = tmp_path / "proj"
    (root / "原始资料").mkdir(parents=True)
    (root / "项目笔记").mkdir(parents=True)
    (root / "__pycache__").mkdir(parents=True)
    # 人工复核类（不可自动清理）
    (root / "原始资料" / "方案.pdf").write_text("pdf content", encoding="utf-8")
    (root / "原始资料" / "立面.dwg").write_bytes(b"dwg")
    (root / "原始资料" / "效果图.jpg").write_bytes(b"jpg")
    (root / "项目笔记" / "复盘.md").write_text("# 复盘", encoding="utf-8")
    # 自动可清理类
    (root / "temp.tmp").write_text("x", encoding="utf-8")
    (root / "old.bak").write_text("x", encoding="utf-8")
    (root / "build.log").write_text("x", encoding="utf-8")
    (root / "Thumbs.db").write_text("x", encoding="utf-8")
    (root / "方案 - Copy.pdf").write_text("dup", encoding="utf-8")  # 重复命名但 pdf→复核优先
    (root / "空文件.txt").write_text("", encoding="utf-8")
    (root / "__pycache__" / "x.pyc").write_text("c", encoding="utf-8")
    return root


def test_scan(tmp_path):
    root = _make_project(tmp_path)
    res = workspace.scan(str(root))
    assert res.accessible
    assert res.total_files >= 10
    assert res.total_dirs >= 3
    assert ".pdf" in res.type_stats
    # 人工复核类包含 pdf/dwg/jpg
    review_exts = {e.ext for e in res.review_items}
    assert ".pdf" in review_exts and ".dwg" in review_exts


def test_preview_classifies_cleanable(tmp_path):
    root = _make_project(tmp_path)
    prev = workspace.cleanup_preview(str(root))
    assert prev["accessible"]
    names = {Path(c["abs_path"]).name for c in prev["candidates"]}
    # 自动可清理
    assert "temp.tmp" in names
    assert "old.bak" in names
    assert "build.log" in names
    assert "Thumbs.db" in names
    assert "空文件.txt" in names
    # pdf 即便带 Copy 也不能自动清理（人工复核优先）
    assert "方案 - Copy.pdf" not in names
    assert "方案.pdf" not in names


def test_apply_moves_to_quarantine_not_delete(tmp_path):
    root = _make_project(tmp_path)
    prev = workspace.cleanup_preview(str(root))
    rels = [c["path"] for c in prev["candidates"] if c["path"].endswith((".tmp", ".bak", ".log"))]
    res = workspace.cleanup_apply(str(root), rels)
    assert res["ok"]
    assert res["moved"] == len(rels)
    # 原文件不在原位
    assert not (root / "temp.tmp").exists()
    # 文件仍存在于隔离区（未删除）
    q = Path(res["quarantine"])
    assert (q / "manifest.json").exists()
    moved_files = list(q.rglob("*"))
    assert any(f.name == "temp.tmp" for f in moved_files)


def test_restore_brings_back(tmp_path):
    root = _make_project(tmp_path)
    prev = workspace.cleanup_preview(str(root))
    rels = [c["path"] for c in prev["candidates"] if c["path"].endswith(".tmp")]
    res = workspace.cleanup_apply(str(root), rels)
    ts = Path(res["quarantine"]).name
    assert not (root / "temp.tmp").exists()

    restored = workspace.cleanup_restore(str(root), ts)
    assert restored["ok"]
    assert restored["restored"] == len(rels)
    assert (root / "temp.tmp").exists()  # 已还原


def test_quarantine_excluded_from_rescan(tmp_path):
    root = _make_project(tmp_path)
    prev = workspace.cleanup_preview(str(root))
    rels = [c["path"] for c in prev["candidates"] if c["path"].endswith(".tmp")]
    workspace.cleanup_apply(str(root), rels)
    # 重新扫描不应把隔离区内文件再算进来
    res = workspace.scan(str(root))
    assert workspace.QUARANTINE_DIRNAME not in [Path(e.abs_path).parts[-2] for e in res.recent_files if len(Path(e.abs_path).parts) >= 2]

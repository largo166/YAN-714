"""三 bug 根治回归守卫(2026-07-09):
- bug1: ingest 执行侧 A 语义(父目录→按子目录建多项目)+ 守卫 expandable 放行。
- bug2: 跨项目图片资产视图 GET /api/assets/all。
"""
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import ingest, project_naming
from app.main import app


# ═══ bug1: A 语义(纯函数)═══

def _mk_tree():
    """造 父目录/(市庄-00/a.txt, 长岭山/b.md, 散落.txt)。返回父目录路径。"""
    d = tempfile.mkdtemp()
    (Path(d) / "市庄-00").mkdir()
    (Path(d) / "市庄-00" / "a.txt").write_text("hi", encoding="utf-8")
    (Path(d) / "长岭山").mkdir()
    (Path(d) / "长岭山" / "b.md").write_text("yo", encoding="utf-8")
    (Path(d) / "散落.txt").write_text("loose", encoding="utf-8")
    return d


def test_group_by_source_parent_becomes_multi_projects():
    """选父目录 → 每个含文件子目录=一个项目组(不把父级整个当一个脏项目)。"""
    d = _mk_tree()
    try:
        g = ingest._group_by_source([d])
        names = {Path(k).name for k in g}
        assert "市庄-00" in names
        assert "长岭山" in names
        # 每个子项目各 1 个文件
        by = {Path(k).name: len(v) for k, v in g.items()}
        assert by["市庄-00"] == 1 and by["长岭山"] == 1
    finally:
        import shutil
        shutil.rmtree(d)


def test_group_by_source_parent_loose_files_not_lost():
    """父目录直属散落文件不丢:归父目录自身一组(仅直属,不递归)。"""
    d = _mk_tree()
    try:
        g = ingest._group_by_source([d])
        parent_group = g.get(str(Path(d)))
        assert parent_group is not None
        # 只含直属 散落.txt,不含子目录里的 a.txt/b.md
        names = {p.name for p in parent_group}
        assert names == {"散落.txt"}
    finally:
        import shutil
        shutil.rmtree(d)


def test_group_by_source_leaf_dir_single_project():
    """叶子目录(无成型子项目)→ 整目录一个项目(原行为不破坏)。"""
    d = tempfile.mkdtemp()
    try:
        (Path(d) / "x.txt").write_text("a", encoding="utf-8")
        (Path(d) / "y.pdf").write_bytes(b"%PDF-1.4")
        g = ingest._group_by_source([d])
        assert len(g) == 1
        assert Path(next(iter(g))).name == Path(d).name
    finally:
        import shutil
        shutil.rmtree(d)


# ═══ bug1: 守卫 expandable ═══

def test_guard_system_dir_rejected_when_not_expandable():
    r = project_naming.reject_as_project("C:/Users/x/Pictures", expandable=False)
    assert r and "系统目录" in r


def test_guard_system_dir_allowed_when_expandable():
    """系统目录名但其下有子项目 → A 语义拆子项目,放行(bug1 根治)。"""
    assert project_naming.reject_as_project("C:/Users/x/Pictures", expandable=True) is None


def test_guard_repo_root_still_rejected_even_expandable():
    """仓库根/盘符根不受 expandable 影响,仍硬拒。"""
    assert project_naming.reject_as_project("C:/仓库", repo_root="C:/仓库", expandable=True) is not None
    assert project_naming.reject_as_project("C:/", expandable=True) is not None


# ═══ bug2: 跨项目资产视图 ═══

@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_all_assets_endpoint_crosses_projects(client):
    """GET /api/assets/all 返回多项目资产,每条带 project_id/project_name。"""
    from app.database import SessionLocal
    from app import models

    p1 = client.post("/api/projects", json={"name": "跨库A"}).json()
    p2 = client.post("/api/projects", json={"name": "跨库B"}).json()
    db = SessionLocal()
    try:
        for pid, cap in ((p1["id"], "A图"), (p2["id"], "B图")):
            db.add(models.FileAsset(
                project_id=pid, source_file_id=0, asset_type="render",
                stored_path=f"{pid}/_assets/x.jpg", thumb_path="", ext="jpg",
                caption=cap, width=10, height=10, status="active",
            ))
        db.commit()
    finally:
        db.close()
    r = client.get("/api/assets/all").json()
    caps = {it["caption"] for it in r["items"]}
    assert "A图" in caps and "B图" in caps  # 两项目的图都在
    pnames = {it["project_name"] for it in r["items"] if it["caption"] in ("A图", "B图")}
    assert "跨库A" in pnames and "跨库B" in pnames  # 带项目名
    # 清理
    db = SessionLocal()
    try:
        from app import models as M
        for pid in (p1["id"], p2["id"]):
            db.query(M.FileAsset).filter_by(project_id=pid).delete()
            db.query(M.Project).filter_by(id=pid).delete()
        db.commit()
    finally:
        db.close()

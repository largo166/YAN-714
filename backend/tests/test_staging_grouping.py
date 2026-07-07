"""块1 A 语义回归守卫(2026-07-07)：staging 分组——选父目录→每个一级子目录一个项目、
叶子目录→整目录一个项目、父目录直属散落文件计 loose 不入组。守护张文在用的 staging 心脏。"""
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def tree():
    """临时目录树：
    parent/
      项目A/  a1.txt a2.md
      项目B/  b1.txt
      readme.txt        <- 父目录直属散落文件(loose)
    leaf/  x.txt y.txt  <- 叶子目录(无子项目)
    """
    root = Path(tempfile.mkdtemp(prefix="staging_a_test_"))
    (root / "parent" / "项目A").mkdir(parents=True)
    (root / "parent" / "项目B").mkdir(parents=True)
    (root / "parent" / "项目A" / "a1.txt").write_text("aa", encoding="utf-8")
    (root / "parent" / "项目A" / "a2.md").write_text("# aa", encoding="utf-8")
    (root / "parent" / "项目B" / "b1.txt").write_text("bb", encoding="utf-8")
    (root / "parent" / "readme.txt").write_text("散落", encoding="utf-8")
    (root / "leaf").mkdir()
    (root / "leaf" / "x.txt").write_text("x", encoding="utf-8")
    (root / "leaf" / "y.txt").write_text("y", encoding="utf-8")
    yield root


def _staging(client, path):
    r = client.post("/api/staging", json={"paths": [str(path)]})
    assert r.status_code == 200
    return r.json()


def test_parent_dir_splits_into_projects(client, tree):
    """选父目录 → multi 模式，每个一级子目录一个 group，散落文件计 loose 不入组。"""
    out = _staging(client, tree / "parent")
    assert out["selection_mode"] == "multi"
    hints = sorted(g["project_hint"] for g in out["groups"])
    assert hints == ["项目A", "项目B"]          # 两个子目录各一项目，不是 parent 一个
    # 散落 readme.txt 不入任何组，计 loose
    assert out["loose_files"] == 1
    # 项目A 2 文件、项目B 1 文件，total=3（不含散落）
    assert out["total_files"] == 3
    by = {g["project_hint"]: len(g["files"]) for g in out["groups"]}
    assert by["项目A"] == 2 and by["项目B"] == 1


def test_leaf_dir_single_project(client, tree):
    """选叶子目录(下面直接是文件、无子项目) → single 模式，整目录一个 group。"""
    out = _staging(client, tree / "leaf")
    assert out["selection_mode"] == "single"
    assert len(out["groups"]) == 1
    assert out["groups"][0]["project_hint"] == "leaf"
    assert out["total_files"] == 2
    assert out["loose_files"] == 0


def test_warn_reason_on_numbered_dir(client):
    """子目录名命中编号前缀 → warn_reason 非空(前端标黄，不拦)。"""
    root = Path(tempfile.mkdtemp(prefix="staging_warn_"))
    (root / "01_项目资料").mkdir()
    (root / "01_项目资料" / "f.txt").write_text("x", encoding="utf-8")
    out = _staging(client, root / "01_项目资料")   # 选它本身=single
    assert out["groups"][0]["warn_reason"] != ""

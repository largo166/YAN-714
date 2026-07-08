"""P0 检索第一生产力 回归守卫(2026-07-08)。
- hit 展示字段纯加法(file_type/doc_type/updated_at/project_id/project_name/project_file_id);
- doc_type 过滤命中层纯加法;
- reveal 唯一新端点:storage_probe 单一口径/文件缺失 404 可读话术/跨项目 404。
检索心脏 retrieval.search 零改动——本文件同时锁旧契约(旧字段原样返回)。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def seeded(client, tmp_path):
    """种子:项目A/B 各一份已入库文档(经真实 upload→index 链路),返回 (pidA, pidB, fidA, docA)。"""
    pa = client.post("/api/projects", json={"name": "P0检索-项目甲"}).json()
    pb = client.post("/api/projects", json={"name": "P0检索-项目乙"}).json()
    # 项目甲:真实上传一个 txt(走 _store_file 落盘,reveal 才有真实物理文件)
    fa = client.post(
        f"/api/projects/{pa['id']}/files",
        files={"file": ("甲方总图说明.txt", "市庄地块总图布置要点:南侧退让、抬板连桥。".encode("utf-8"), "text/plain")},
    ).json()
    ra = client.post(f"/api/projects/{pa['id']}/files/{fa['id']}/index").json()
    # 项目乙:同词文档(验证 project_id 过滤能分开)
    fb = client.post(
        f"/api/projects/{pb['id']}/files",
        files={"file": ("乙方总图批注.txt", "另一项目的总图批注,与甲无关。".encode("utf-8"), "text/plain")},
    ).json()
    client.post(f"/api/projects/{pb['id']}/files/{fb['id']}/index")
    return pa["id"], pb["id"], fa["id"], ra["document_id"]


def _search(client, **body):
    r = client.post("/api/knowledge/search", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_hit_enrichment_and_project_backref(client, seeded):
    """hit 新字段回填:doc_type/file_type/updated_at + project_file_id 反查正确(reveal 的地基)。"""
    pid_a, _pid_b, fid_a, _doc_a = seeded
    data = _search(client, query="总图", top_k=10)
    assert data["hits"], "应有命中"
    mine = [h for h in data["hits"] if h["project_id"] == pid_a]
    assert mine, "项目甲的文档应命中且带 project_id"
    h = mine[0]
    assert h["project_file_id"] == fid_a          # 反查到上传的那份文件
    assert h["project_name"] == "P0检索-项目甲"
    assert h["doc_type"] != "" and h["file_type"] != "" and h["updated_at"] != ""
    # 旧契约不破:老字段原样在
    for k in ("document_id", "title", "snippet", "score", "matched_text", "engine", "locator"):
        assert k in h


def test_project_id_filter_scopes_results(client, seeded):
    """project_id 过滤走现有通路:甲的范围内看不到乙的文档。"""
    pid_a, pid_b, _fid, _doc = seeded
    data = _search(client, query="总图", top_k=10, project_id=pid_a)
    assert data["hits"], "项目甲范围应有命中"
    assert all(h["project_id"] == pid_a for h in data["hits"])
    data_b = _search(client, query="总图", top_k=10, project_id=pid_b)
    assert all(h["project_id"] == pid_b for h in data_b["hits"])


def test_doc_type_filter_additive(client, seeded):
    """doc_type 过滤:匹配类型保留;不存在的类型→空(不报错,纯加法)。"""
    data_all = _search(client, query="总图", top_k=10)
    assert data_all["hits"]
    some_type = data_all["hits"][0]["doc_type"]
    data_t = _search(client, query="总图", top_k=10, doc_type=some_type)
    assert data_t["hits"] and all(h["doc_type"] == some_type for h in data_t["hits"])
    data_none = _search(client, query="总图", top_k=10, doc_type="不存在的类型")
    assert data_none["hits"] == []


def test_reveal_missing_and_cross_project(client, seeded, monkeypatch):
    """reveal 防呆:文件缺失→404 可读话术(不静默);跨项目 fid→404;成功路径→ok+mode。"""
    pid_a, pid_b, fid_a, _doc = seeded
    # 跨项目:用乙的 pid 揭甲的 fid → 404
    r = client.post(f"/api/projects/{pid_b}/files/{fid_a}/reveal")
    assert r.status_code == 404
    # 成功路径:mock 掉 explorer 弹窗(测试环境不真开资源管理器)
    import subprocess
    monkeypatch.setattr(subprocess, "Popen", lambda *a, **k: None)
    r = client.post(f"/api/projects/{pid_a}/files/{fid_a}/reveal")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True and body["mode"] == "select" and body["path"]
    # 文件缺失:把物理文件挪走 → 404 且话术含"库健康体检"指引(可读错误,不白屏)
    import os
    os.remove(body["path"])
    r2 = client.post(f"/api/projects/{pid_a}/files/{fid_a}/reveal")
    assert r2.status_code == 404
    assert "库健康体检" in r2.json()["detail"]

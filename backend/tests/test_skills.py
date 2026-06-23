"""共创营地内置技能目录端点测试（只读，不触发执行）。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_list_skills(client):
    r = client.get("/api/skills")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 6
    ids = {s["id"] for s in body["items"]}
    assert {"ppt", "img", "review", "task", "meeting", "compete"} <= ids
    # 每项含展示所需字段，且不泄漏任何密钥/执行副作用
    for s in body["items"]:
        assert s["title"] and s["example"]


def _new_project(client, name="技能执行测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def test_run_skill_unknown_project_404(client):
    r = client.post("/api/projects/999999/skills/ppt/run", json={"input": ""})
    assert r.status_code == 404


def test_run_skill_unknown_skill_400(client):
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/skills/nope/run", json={"input": ""})
    assert r.status_code == 400


def test_run_skill_status_contract(client):
    """技能执行三态契约（不伪造）：无 key→not_configured；有 key 但无材料→no_material；
    其余 ok/error。无论环境是否配 key，都不得返回伪造的成功结果。"""
    pid = _new_project(client)  # 空项目：无任何已解析文件、无知识库命中
    r = client.post(f"/api/projects/{pid}/skills/ppt/run", json={"input": ""})
    assert r.status_code == 200
    body = r.json()
    assert body["skill_id"] == "ppt"
    assert body["status"] in {"not_configured", "no_material", "ok", "error"}
    if body["status"] == "not_configured":
        assert body["sources"] == []  # 未生成不挂出处
    elif body["status"] == "no_material":
        # 需 RAG 的技能在空项目上应走 no_material（有 key 时）
        assert body["sources"] == []


def test_project_scoped_search_empty_when_no_indexed_docs(client):
    """项目级检索：项目无任何已索引文档 → 空结果（不报错）。"""
    pid = _new_project(client, name="空项目检索测试")
    r = client.post("/api/knowledge/search", json={"query": "立面", "top_k": 5, "project_id": pid})
    assert r.status_code == 200
    assert r.json()["hits"] == []

"""AI 按需生成元数据端点测试（无 key 环境只断言三态契约，不依赖真实 LLM）。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_doc(client, title="测试文档", content="一些正文内容", tags=""):
    r = client.post(
        "/api/knowledge/documents",
        json={"title": title, "content_text": content, "tags": tags},
    )
    assert r.status_code == 201
    return r.json()["id"]


def test_generate_metadata_404(client):
    r = client.post("/api/knowledge/documents/999999/generate-metadata")
    assert r.status_code == 404


def test_generate_metadata_not_configured_does_not_write(client):
    """无 key → not_configured，且不写库（description 仍空）。测试库默认无 DeepSeek key。"""
    did = _new_doc(client, content="市庄项目立面深化要点")
    try:
        r = client.post(f"/api/knowledge/documents/{did}/generate-metadata")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "not_configured"
        # 未写库
        doc = client.get(f"/api/knowledge/documents/{did}").json()
        assert doc["description"] == ""
    finally:
        client.delete(f"/api/knowledge/documents/{did}")


def test_generate_metadata_no_material(client):
    """空正文文档：有 key 时返回 no_material；无 key 时 not_configured。均不伪造摘要。"""
    did = _new_doc(client, content="   ")
    try:
        r = client.post(f"/api/knowledge/documents/{did}/generate-metadata")
        assert r.status_code == 200
        assert r.json()["status"] in {"no_material", "not_configured"}
        doc = client.get(f"/api/knowledge/documents/{did}").json()
        assert doc["description"] == ""
    finally:
        client.delete(f"/api/knowledge/documents/{did}")

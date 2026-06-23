"""项目 chips 与知识库统计端点测试。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_project_city_client_create_and_update(client):
    created = client.post(
        "/api/projects",
        json={
            "name": "城市甲方测试项目",
            "status": "active",
            "city": "石家庄",
            "client": "保利",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["city"] == "石家庄"
    assert body["client"] == "保利"

    updated = client.put(f"/api/projects/{body['id']}", json={"client": "保利发展"})
    assert updated.status_code == 200
    assert updated.json()["city"] == "石家庄"
    assert updated.json()["client"] == "保利发展"


def test_knowledge_stats(client):
    created = client.post(
        "/api/knowledge/documents",
        json={
            "title": "统计测试文档",
            "content_text": "第一段中文\n\nSecond paragraph",
            "tags": "测试",
        },
    )
    assert created.status_code == 201

    stats = client.get("/api/knowledge/stats")
    assert stats.status_code == 200
    body = stats.json()
    assert body["documents"] >= 1
    assert body["indexed"] >= 1
    assert body["chunks"] >= 2
    assert body["cjk_chunks"] >= 1
    assert body["engine"] in ("fts5", "like")

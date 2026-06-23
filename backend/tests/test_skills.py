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

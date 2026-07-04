"""管理口令门槛(P1-6):status/setup/login 三端点;哈希不回吐、错误口令 401、重复设置 409。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_admin_gate_flow(client):
    # 初始:未设置
    r = client.get("/api/admin/status")
    assert r.status_code == 200
    assert r.json() == {"configured": False}

    # 未设置就登录 → 409
    assert client.post("/api/admin/login", json={"password": "whatever"}).status_code == 409

    # 口令太短 → 400
    assert client.post("/api/admin/setup", json={"password": "ab"}).status_code == 400

    # 设置成功
    r = client.post("/api/admin/setup", json={"password": "romai2026"})
    assert r.status_code == 200 and r.json()["ok"] is True
    assert client.get("/api/admin/status").json() == {"configured": True}

    # 重复设置 → 409(不静默覆盖)
    assert client.post("/api/admin/setup", json={"password": "another"}).status_code == 409

    # 错误口令 → 401;正确口令 → ok
    assert client.post("/api/admin/login", json={"password": "wrong"}).status_code == 401
    r = client.post("/api/admin/login", json={"password": "romai2026"})
    assert r.status_code == 200 and r.json()["ok"] is True

    # 设置接口/状态接口都不回吐哈希或明文
    body = client.get("/api/admin/status").json()
    assert "password" not in str(body) and "hash" not in str(body)

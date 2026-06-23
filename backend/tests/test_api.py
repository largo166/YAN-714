"""最小 API 测试：健康检查、项目 CRUD、设置读写（密钥脱敏）。

用 `with TestClient(app)` 触发 lifespan（init_db 建表+seed），与真实启动路径一致。
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["database"] == "sqlite"


def test_projects_list_and_create(client):
    r = client.get("/api/projects")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "total" in body
    before = body["total"]

    created = client.post("/api/projects", json={"name": "pytest 新项目", "status": "active"})
    assert created.status_code == 201
    assert created.json()["name"] == "pytest 新项目"

    after = client.get("/api/projects").json()
    assert after["total"] == before + 1


def test_create_project_validation(client):
    r = client.post("/api/projects", json={"name": ""})
    assert r.status_code == 422


def test_project_get_update_delete(client):
    created = client.post("/api/projects", json={"name": "CRUD 项目", "status": "planning"}).json()
    pid = created["id"]

    got = client.get(f"/api/projects/{pid}")
    assert got.status_code == 200
    assert got.json()["name"] == "CRUD 项目"

    updated = client.put(f"/api/projects/{pid}", json={"status": "completed"})
    assert updated.status_code == 200
    assert updated.json()["status"] == "completed"
    assert updated.json()["name"] == "CRUD 项目"  # 未传的字段保持不变

    deleted = client.delete(f"/api/projects/{pid}")
    assert deleted.status_code == 204

    assert client.get(f"/api/projects/{pid}").status_code == 404


def test_project_not_found(client):
    assert client.get("/api/projects/999999").status_code == 404


def test_settings_masking_and_update(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    body = r.json()
    assert "deepseek_api_key" not in body  # 不回吐明文
    assert body["deepseek_api_key_set"] is False

    # 写入 key 后，只暴露“已配置”，仍不回吐明文
    upd = client.put("/api/settings", json={"deepseek_api_key": "sk-test", "theme": "dark"})
    assert upd.status_code == 200
    assert upd.json()["deepseek_api_key_set"] is True
    assert upd.json()["theme"] == "dark"
    assert "deepseek_api_key" not in upd.json()

    # 再次保存且 key 传空 -> 保持不变（仍为已配置）
    upd2 = client.put("/api/settings", json={"deepseek_api_key": "", "deepseek_model": "deepseek-chat"})
    assert upd2.json()["deepseek_api_key_set"] is True

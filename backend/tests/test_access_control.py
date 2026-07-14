"""用户已取消公网访问口令：匿名 API 可用，登录端点不再存在。"""

from fastapi.testclient import TestClient

from app.main import app


def test_public_api_is_anonymous_and_has_no_login_endpoint():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/projects").status_code == 200
        assert client.get("/api/access/status").status_code == 404

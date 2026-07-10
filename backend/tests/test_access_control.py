"""公网访问闸：服务端必须拒绝未认证 API，不能只靠前端隐藏。"""

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_public_access_requires_signed_session(monkeypatch):
    monkeypatch.setitem(settings.__dict__, "access_control_enabled", True)
    monkeypatch.setitem(settings.__dict__, "access_password", "correct-horse-battery")
    monkeypatch.setitem(settings.__dict__, "access_session_secret", "test-session-secret")
    monkeypatch.setitem(settings.__dict__, "access_cookie_secure", False)

    with TestClient(app) as client:
        assert client.get("/health").status_code == 200

        blocked = client.get("/api/projects")
        assert blocked.status_code == 401
        assert blocked.json()["detail"] == "需要访问口令"

        wrong = client.post("/api/access/login", json={"password": "wrong"})
        assert wrong.status_code == 401
        assert "romai_access" not in wrong.cookies

        login = client.post(
            "/api/access/login", json={"password": "correct-horse-battery"}
        )
        assert login.status_code == 200
        assert login.json() == {"ok": True}
        assert login.cookies["romai_access"]
        assert "HttpOnly" in login.headers["set-cookie"]
        assert "SameSite=strict" in login.headers["set-cookie"]

        allowed = client.get("/api/projects")
        assert allowed.status_code == 200

        logout = client.post("/api/access/logout")
        assert logout.status_code == 200
        assert client.get("/api/projects").status_code == 401


def test_access_status_is_honest_when_gate_is_disabled(monkeypatch):
    monkeypatch.setitem(settings.__dict__, "access_control_enabled", False)
    monkeypatch.setitem(settings.__dict__, "access_password", "")

    with TestClient(app) as client:
        status = client.get("/api/access/status")
        assert status.status_code == 200
        assert status.json() == {
            "enabled": False,
            "configured": False,
            "authenticated": True,
        }
        assert client.get("/api/projects").status_code == 200

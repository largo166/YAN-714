"""公网访问闸接口冒烟：不打印口令或 Cookie。"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from http.cookies import SimpleCookie
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_password() -> str:
    for raw in (ROOT / "deploy" / "public.env").read_text(encoding="utf-8").splitlines():
        if raw.startswith("ACCESS_PASSWORD="):
            return raw.split("=", 1)[1]
    raise RuntimeError("deploy/public.env 缺少 ACCESS_PASSWORD")


def call(base: str, path: str, *, method: str = "GET", body: dict | None = None, cookie: str = ""):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if cookie:
        headers["Cookie"] = cookie
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010").rstrip("/")
    password = load_password()

    health, _, _ = call(base, "/health")
    assert health == 200, health

    blocked, _, blocked_body = call(base, "/api/projects")
    assert blocked == 401, (blocked, blocked_body)

    status_code, _, status_body = call(base, "/api/access/status")
    status = json.loads(status_body)
    assert status_code == 200 and status == {
        "enabled": True,
        "configured": True,
        "authenticated": False,
    }, (status_code, status)

    wrong, _, _ = call(base, "/api/access/login", method="POST", body={"password": "definitely-wrong"})
    assert wrong == 401, wrong

    login, headers, login_body = call(base, "/api/access/login", method="POST", body={"password": password})
    assert login == 200 and json.loads(login_body) == {"ok": True}, (login, login_body)
    set_cookie = headers.get("Set-Cookie", "")
    assert "HttpOnly" in set_cookie and "SameSite=strict" in set_cookie and "Secure" in set_cookie, set_cookie
    parsed = SimpleCookie()
    parsed.load(set_cookie)
    cookie = f"romai_access={parsed['romai_access'].value}"

    allowed, _, _ = call(base, "/api/projects", cookie=cookie)
    assert allowed == 200, allowed

    print(json.dumps({"base": base, "health": health, "blocked": blocked, "login": login, "allowed": allowed}))


if __name__ == "__main__":
    main()

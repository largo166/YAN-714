"""匿名公网形态冒烟：确认 API 可直达且产物不再包含口令输入界面。"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request


def call(base: str, path: str):
    request = urllib.request.Request(base + path, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def main() -> None:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8010").rstrip("/")

    health, _, _ = call(base, "/health")
    assert health == 200, health

    projects, _, _ = call(base, "/api/projects")
    assert projects == 200, projects

    access_status, _, _ = call(base, "/api/access/status")
    assert access_status == 404, access_status

    root_status, _, root_body = call(base, "/")
    assert root_status == 200, root_status
    html = root_body.decode("utf-8")
    match = re.search(r'src="([^"]+\.js)"', html)
    assert match, "页面没有主脚本"
    bundle_status, _, bundle_body = call(base, match.group(1))
    assert bundle_status == 200, bundle_status
    bundle = bundle_body.decode("utf-8")
    forbidden = ["ROM-AI 受保护访问", "输入管理口令进入", "驾驶舱口令"]
    assert not any(text in bundle for text in forbidden), "生产 bundle 仍含口令输入界面"

    print(
        json.dumps(
            {
                "base": base,
                "health": health,
                "projects_anonymous": projects,
                "login_endpoint_removed": access_status,
                "password_ui_removed": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

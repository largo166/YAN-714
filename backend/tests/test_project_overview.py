"""项目中心 KPI 真实计数端点测试（只读聚合）。

覆盖：404 错误分支 + happy path（文件/会议/待办/纪要 计数）。
待办计数取每会议最新一版纪要，避免重生成重复计数——本测试插入两版纪要验证只算最新版。
上传落盘到真实 data/uploads/{pid}，用 finally 清理自建项目目录（沿用 4D 自清理约定）。
"""
import shutil
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import models, uploads
from app.database import SessionLocal
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _cleanup_project_dir(pid: int):
    d = uploads.UPLOADS_ROOT / str(pid)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


def test_overview_404_for_missing_project(client):
    r = client.get("/api/projects/999999/overview")
    assert r.status_code == 404


def test_overview_counts(client):
    pid = client.post("/api/projects", json={"name": "KPI计数测试项目"}).json()["id"]
    try:
        # 初始：全 0（0 是真实值，非占位）
        base = client.get(f"/api/projects/{pid}/overview")
        assert base.status_code == 200
        assert base.json() == {"files": 0, "meetings": 0, "todos": 0, "minutes": 0}

        # 文件 +1
        files = {"file": ("需求.txt", "甲方要求：退台立面".encode("utf-8"), "text/plain")}
        assert client.post(f"/api/projects/{pid}/files", files=files).status_code == 201

        # 会议 +1
        mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "评审会"}).json()["id"]

        # 同一会议插两版纪要：旧版 3 条待办、新版 2 条——只应计最新版的 2 条。
        # 显式 created_at 区分新旧，避免 Windows 低精度时钟把两行时间戳撞平致排序不定。
        db = SessionLocal()
        try:
            db.add(
                models.MeetingMinute(
                    meeting_id=mid,
                    todos_json='["a","b","c"]',
                    created_at=datetime(2026, 1, 1, 10, 0, 0),
                )
            )
            db.add(
                models.MeetingMinute(
                    meeting_id=mid,
                    todos_json='["x","y"]',
                    created_at=datetime(2026, 1, 1, 11, 0, 0),
                )
            )
            db.commit()
        finally:
            db.close()

        ov = client.get(f"/api/projects/{pid}/overview").json()
        assert ov["files"] == 1
        assert ov["meetings"] == 1
        assert ov["minutes"] == 2  # 两版纪要都计入“纪要份数”
        assert ov["todos"] == 2  # 待办只取最新版
    finally:
        _cleanup_project_dir(pid)

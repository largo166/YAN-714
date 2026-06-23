"""第三批后端端点：成果发送 / 回流 / 分派 / 进度。"""
import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import models
from app.database import SessionLocal
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_result_send_channels_and_preview_not_configured(client):
    channels = client.get("/api/result-send/channels")
    assert channels.status_code == 200
    assert {item["channel"] for item in channels.json()["items"]} == {"email", "wecom", "wx"}
    assert all(item["configured"] is False for item in channels.json()["items"])

    preview = client.post(
        "/api/result-send/preview",
        json={"content": "成果卡内容", "channel": "email"},
    )
    assert preview.status_code == 200
    assert preview.json() == {"status": "not_configured", "rendered": "", "channel": "email"}

    bad = client.post(
        "/api/result-send/preview",
        json={"content": "成果卡内容", "channel": "sms"},
    )
    assert bad.status_code == 400


def test_confirmed_milestones_reflow_and_progress(client):
    pid = client.post("/api/projects", json={"name": "回流测试项目"}).json()["id"]
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "回流会"}).json()["id"]

    db = SessionLocal()
    try:
        draft = models.MeetingMinute(
            meeting_id=mid,
            todos_json=json.dumps([{"text": "草稿待办", "owner": "张三"}], ensure_ascii=False),
            review_status="draft",
            created_at=datetime(2026, 1, 1, 9, 0, 0),
        )
        confirmed = models.MeetingMinute(
            meeting_id=mid,
            todos_json=json.dumps(
                [{"text": "确认待办", "owner": "李四", "due": "2026-06-30", "urgent": True}],
                ensure_ascii=False,
            ),
            review_status="confirmed",
            created_at=datetime(2026, 1, 1, 10, 0, 0),
        )
        db.add_all([draft, confirmed])
        db.commit()
        minute_id = confirmed.id
    finally:
        db.close()

    milestones = client.get(f"/api/projects/{pid}/milestones")
    assert milestones.status_code == 200
    assert milestones.json() == {
        "items": [
            {"title": "确认待办", "owner": "李四", "due": "2026-06-30", "urgent": True}
        ]
    }

    progress = client.get(f"/api/projects/{pid}/progress")
    assert progress.status_code == 200
    assert progress.json() == {"pct": 0, "next_node": "确认待办", "next_due": "2026-06-30"}

    reflow = client.post(f"/api/projects/{pid}/meetings/{mid}/minute/{minute_id}/reflow")
    assert reflow.status_code == 200
    assert reflow.json() == {"status": "ok", "reflowed_count": 1}

    again = client.post(f"/api/projects/{pid}/meetings/{mid}/minute/{minute_id}/reflow")
    assert again.status_code == 200
    assert again.json() == {"status": "ok", "reflowed_count": 0}

    done = client.get(f"/api/projects/{pid}/progress")
    assert done.status_code == 200
    assert done.json() == {"pct": 100, "next_node": "", "next_due": ""}


def test_reflow_requires_confirmed_minute(client):
    pid = client.post("/api/projects", json={"name": "草稿禁止回流项目"}).json()["id"]
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "草稿会"}).json()["id"]

    db = SessionLocal()
    try:
        row = models.MeetingMinute(
            meeting_id=mid,
            todos_json=json.dumps([{"text": "草稿待办"}], ensure_ascii=False),
            review_status="draft",
        )
        db.add(row)
        db.commit()
        minute_id = row.id
    finally:
        db.close()

    r = client.post(f"/api/projects/{pid}/meetings/{mid}/minute/{minute_id}/reflow")
    assert r.status_code == 400


def test_team_assignments_and_soft_delete(client):
    pid = client.post("/api/projects", json={"name": "任务分派项目"}).json()["id"]
    member = client.post("/api/team/members", json={"name": "分派成员", "role": "主创"}).json()

    created = client.post(
        f"/api/projects/{pid}/team-assignments",
        json={"member_id": member["id"], "task_title": "完成方案复核", "due": "2026-07-01"},
    )
    assert created.status_code == 201
    assert created.json()["task_title"] == "完成方案复核"
    assert created.json()["project_id"] == pid

    members = client.get("/api/team/members")
    row = next(item for item in members.json()["items"] if item["id"] == member["id"])
    assert row["assignments"] == [
        {"task_title": "完成方案复核", "due": "2026-07-01", "project_id": pid}
    ]

    missing = client.post(
        f"/api/projects/{pid}/team-assignments",
        json={"member_id": 999999, "task_title": "不存在成员"},
    )
    assert missing.status_code == 404

    deleted = client.delete(f"/api/team/members/{member['id']}")
    assert deleted.status_code == 204
    after = client.get("/api/team/members").json()["items"]
    assert all(item["id"] != member["id"] for item in after)
    assert client.delete("/api/team/members/999999").status_code == 404

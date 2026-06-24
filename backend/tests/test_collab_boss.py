"""C4/C5 协作平台与管理驾驶舱端点测试。"""
import json
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

from app import models
from app.database import SessionLocal
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_team_members_empty_create_update_and_404(client):
    empty = client.get("/api/team/members")
    assert empty.status_code == 200
    assert empty.json() == {"items": []}

    created = client.post(
        "/api/team/members",
        json={"name": "严硕", "role": "设计负责人", "duty": "项目统筹", "birthday": "06-23"},
    )
    assert created.status_code == 201
    mid = created.json()["id"]

    updated = client.put(f"/api/team/members/{mid}", json={"duty": "项目中心分派"})
    assert updated.status_code == 200
    assert updated.json()["duty"] == "项目中心分派"

    assert client.put("/api/team/members/999999", json={"duty": "x"}).status_code == 404


def test_agents_catalog(client):
    r = client.get("/api/agents")
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 4
    assert {item["status"] for item in body["items"]} == {"ok", "plan"}


def test_agent_run_unknown_404(client):
    pid = client.post("/api/projects", json={"name": "Agent执行测试"}).json()["id"]
    r = client.post("/api/agents/nope/run", json={"project_id": pid, "input": ""})
    assert r.status_code == 404


def test_agent_run_plan_agent_is_honest(client):
    """规划中 Agent(审图老法师)执行返回 status=plan,不伪造能力(红线)。"""
    pid = client.post("/api/projects", json={"name": "Agent执行测试2"}).json()["id"]
    r = client.post("/api/agents/review-master/run", json={"project_id": pid, "input": ""})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "plan"
    assert body["sources"] == []


def test_agent_run_ok_agent_empty_project(client):
    """可用 Agent 在空项目上:有 key→no_material;无 key→not_configured。均不伪造结果。"""
    pid = client.post("/api/projects", json={"name": "Agent执行测试3"}).json()["id"]
    r = client.post("/api/agents/material-helper/run", json={"project_id": pid, "input": ""})
    assert r.status_code == 200
    assert r.json()["status"] in {"no_material", "not_configured"}
    assert r.json()["sources"] == []


def test_broadcasts_and_ticker(client):
    created = client.post("/api/broadcast/broadcasts", json={"text": "今天 17:00 前同步项目风险"})
    assert created.status_code == 201
    assert created.json()["text"] == "今天 17:00 前同步项目风险"

    today = date.today().strftime("%m-%d")
    client.post(
        "/api/team/members",
        json={"name": "生日成员", "role": "设计师", "birthday": today},
    )

    broadcasts = client.get("/api/broadcast/broadcasts")
    assert broadcasts.status_code == 200
    assert any(item["text"] == "今天 17:00 前同步项目风险" for item in broadcasts.json()["items"])

    ticker = client.get("/api/broadcast/ticker")
    assert ticker.status_code == 200
    kinds = {item["kind"] for item in ticker.json()["items"]}
    assert {"broadcast", "birthday"}.issubset(kinds)


def test_boss_dashboard_workload_ai_usage_and_not_configured(client):
    pid = client.post("/api/projects", json={"name": "驾驶舱测试项目", "status": "active"}).json()["id"]
    member = client.post("/api/team/members", json={"name": "工作量成员", "role": "主创"}).json()
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "任务会"}).json()["id"]

    db = SessionLocal()
    try:
        db.add(
            models.MeetingMinute(
                meeting_id=mid,
                todos_json=json.dumps([{"text": "完成方案复核", "owner": member["name"]}], ensure_ascii=False),
                created_at=datetime.utcnow(),
            )
        )
        db.add(
            models.ProjectAnalysis(
                project_id=pid,
                task="difficulty",
                status="ok",
                content=json.dumps({"risks": [{"level": "high", "text": "限高风险"}]}, ensure_ascii=False),
                created_at=datetime.utcnow(),
            )
        )
        db.commit()
    finally:
        db.close()

    dashboard = client.get("/api/boss/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json()["active_projects"] >= 1
    assert dashboard.json()["high_risks"] >= 1
    assert dashboard.json()["ai_usage_week"] >= 2
    assert dashboard.json()["near_delivery"] == 0

    workload = client.get("/api/boss/workload")
    assert workload.status_code == 200
    assert any(item["name"] == member["name"] and item["pct"] == 100 for item in workload.json()["items"])

    usage = client.get("/api/boss/ai-usage")
    assert usage.status_code == 200
    assert {"PPT", "纪要", "生图", "评审", "任务"} == {
        item["capability"] for item in usage.json()["items"]
    }

    assert client.get("/api/boss/feishu-board").json() == {
        "status": "not_configured",
        "items": [],
    }
    assert client.get("/api/boss/comments").json() == {
        "status": "not_configured",
        "items": [],
    }

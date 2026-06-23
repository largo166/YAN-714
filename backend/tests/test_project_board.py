"""项目中心看板端点测试：里程碑 / 风险 / 可复用资产。"""
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


def _new_project(client, name="项目中心看板测试项目") -> int:
    return client.post("/api/projects", json={"name": name}).json()["id"]


def test_milestones_404_for_missing_project(client):
    r = client.get("/api/projects/999999/milestones")
    assert r.status_code == 404


def test_milestones_from_latest_minutes(client):
    pid = _new_project(client)
    mid = client.post(f"/api/projects/{pid}/meetings", json={"title": "周例会"}).json()["id"]

    db = SessionLocal()
    try:
        db.add(
            models.MeetingMinute(
                meeting_id=mid,
                todos_json=json.dumps(["旧待办"], ensure_ascii=False),
                created_at=datetime(2026, 1, 1, 10, 0, 0),
            )
        )
        db.add(
            models.MeetingMinute(
                meeting_id=mid,
                todos_json=json.dumps(
                    [
                        {
                            "text": "完成五个体量方案比选",
                            "owner": "严硕",
                            "due": "2026-06-24",
                            "urgent": True,
                        }
                    ],
                    ensure_ascii=False,
                ),
                review_status="confirmed",
                created_at=datetime(2026, 1, 1, 11, 0, 0),
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/projects/{pid}/milestones")
    assert r.status_code == 200
    assert r.json() == {
        "items": [
            {
                "title": "完成五个体量方案比选",
                "owner": "严硕",
                "due": "2026-06-24",
                "urgent": True,
            }
        ]
    }


def test_risks_404_for_missing_project(client):
    r = client.get("/api/projects/999999/risks")
    assert r.status_code == 404


def test_risks_from_structured_analysis(client):
    pid = _new_project(client)
    db = SessionLocal()
    try:
        db.add(
            models.ProjectAnalysis(
                project_id=pid,
                task="difficulty",
                status="ok",
                content=json.dumps(
                    {
                        "risks": [
                            {"level": "high", "text": "限高与日照存在冲突"},
                            {"level": "medium", "text": "货量指标仍需确认"},
                        ]
                    },
                    ensure_ascii=False,
                ),
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/projects/{pid}/risks")
    assert r.status_code == 200
    assert r.json() == {
        "items": [
            {"level": "high", "text": "限高与日照存在冲突"},
            {"level": "medium", "text": "货量指标仍需确认"},
        ]
    }


def test_risks_ignore_plain_text_analysis(client):
    pid = _new_project(client)
    db = SessionLocal()
    try:
        db.add(
            models.ProjectAnalysis(
                project_id=pid,
                task="overview",
                status="ok",
                content="高风险：这里是纯正文，接口不应从正文硬抽风险。",
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/projects/{pid}/risks")
    assert r.status_code == 200
    assert r.json() == {"items": []}


def test_reusable_assets_404_for_missing_project(client):
    r = client.get("/api/projects/999999/reusable-assets")
    assert r.status_code == 404


def test_reusable_assets_from_indexed_docs(client):
    pid = _new_project(client)
    db = SessionLocal()
    try:
        doc = models.KnowledgeDocument(
            title="宋式酒店类比库",
            content_text="案例资料",
            source_path="case.md",
            file_type="markdown",
            tags="类比,方法",
        )
        db.add(doc)
        db.flush()
        db.add(
            models.ProjectFile(
                project_id=pid,
                filename="case.md",
                stored_path=f"{pid}/case.md",
                file_type="md",
                indexed_doc_id=doc.id,
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()

    r = client.get(f"/api/projects/{pid}/reusable-assets")
    assert r.status_code == 200
    assert r.json() == {"items": [{"kind": "类比", "name": "宋式酒店类比库"}]}

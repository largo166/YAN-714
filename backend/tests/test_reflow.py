"""回流契约测试（阶段5）：人工确认成果回写数据基地、幂等、对内研判不外泄、未确认不回流。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app import models, safe_json


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project(client, name="回流测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


# ── 研判回流 ──
def test_reflow_analysis_unknown_404(client):
    assert client.post("/api/reflow/analysis/999999").status_code == 404


def test_reflow_analysis_not_ok_rejected(client):
    """研判 status!=ok 或无正文 → not_confirmed，不写库（不伪造）。"""
    pid = _new_project(client)
    db = SessionLocal()
    try:
        a = models.ProjectAnalysis(project_id=pid, task="overview", status="no_material", content="")
        db.add(a)
        db.commit()
        db.refresh(a)
        aid = a.id
    finally:
        db.close()
    r = client.post(f"/api/reflow/analysis/{aid}").json()
    assert r["status"] == "not_confirmed"
    assert r["document_id"] == 0


def test_reflow_analysis_ok_then_idempotent(client):
    """status=ok 研判回写知识库→ok+带出处+可检索；再调→already 不重复写。"""
    pid = _new_project(client, name="三亚研判回流")
    db = SessionLocal()
    try:
        a = models.ProjectAnalysis(
            project_id=pid, task="difficulty", status="ok",
            content="本项目核心难点：在有限用地内平衡电竞商业与可售住宅。",
            sources_json=safe_json.dumps_safe([{"title": "任务书", "snippet": "电竞主题"}]),
        )
        db.add(a)
        db.commit()
        db.refresh(a)
        aid = a.id
    finally:
        db.close()
    doc_id = None
    try:
        r1 = client.post(f"/api/reflow/analysis/{aid}").json()
        assert r1["status"] == "ok"
        doc_id = r1["document_id"]
        assert "三亚研判回流" in r1["resource"]
        # 可全局检索命中
        sr = client.post("/api/knowledge/search", json={"query": "电竞 难点 用地", "top_k": 5})
        assert any(h["document_id"] == doc_id for h in sr.json()["hits"])
        # 幂等
        r2 = client.post(f"/api/reflow/analysis/{aid}").json()
        assert r2["status"] == "already"
        assert r2["document_id"] == doc_id
    finally:
        db = SessionLocal()
        if doc_id:
            db.query(models.KnowledgeDocument).filter_by(id=doc_id).delete()
        db.query(models.ProjectAnalysis).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


# ── 纪要回流 ──
def _make_meeting_minute(project_id, review_status):
    db = SessionLocal()
    try:
        m = models.Meeting(project_id=project_id, title="方案对接会", status="created")
        db.add(m)
        db.commit()
        db.refresh(m)
        minute = models.MeetingMinute(
            meeting_id=m.id, gen_status="ok",
            summary_json=safe_json.dumps_safe([{"text": "确认退台立面方向"}]),
            demand_external_json=safe_json.dumps_safe([{"text": "甲方要求提升展示区品质"}]),
            demand_internal_json=safe_json.dumps_safe([{"text": "内部研判：甲方预算其实偏紧需控成本"}]),
            decisions_json=safe_json.dumps_safe([{"text": "下周出立面比选三方案"}]),
            review_status=review_status,
        )
        db.add(minute)
        db.commit()
        db.refresh(minute)
        return m.id, minute.id
    finally:
        db.close()


def test_reflow_minute_draft_rejected(client):
    """draft 纪要不能回流（未人工审定）。"""
    pid = _new_project(client)
    mid, minid = _make_meeting_minute(pid, "draft")
    try:
        r = client.post(f"/api/reflow/minute/{minid}").json()
        assert r["status"] == "not_confirmed"
    finally:
        db = SessionLocal()
        db.query(models.MeetingMinute).filter_by(id=minid).delete()
        db.query(models.Meeting).filter_by(id=mid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


def test_reflow_minute_confirmed_external_only(client):
    """confirmed 纪要回写知识库→ok；只含对外版,对内研判绝不外泄（红线）。"""
    pid = _new_project(client, name="纪要回流项目")
    mid, minid = _make_meeting_minute(pid, "confirmed")
    doc_id = None
    try:
        r = client.post(f"/api/reflow/minute/{minid}").json()
        assert r["status"] == "ok"
        doc_id = r["document_id"]
        db = SessionLocal()
        doc = db.get(models.KnowledgeDocument, doc_id)
        content = doc.content_text
        db.close()
        assert "退台立面方向" in content              # 对外内容回流
        assert "甲方要求提升展示区品质" in content      # 对外诉求回流
        assert "预算其实偏紧" not in content            # 对内研判不外泄(红线)
    finally:
        db = SessionLocal()
        if doc_id:
            db.query(models.KnowledgeDocument).filter_by(id=doc_id).delete()
        db.query(models.MeetingMinute).filter_by(id=minid).delete()
        db.query(models.Meeting).filter_by(id=mid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


def test_reflow_two_same_title_meetings_no_collision(client):
    """同项目内两个同名会议的纪要,各自回流出独立条目(用 reflowed_doc_id 链,不靠标题去重→不静默丢失)。"""
    pid = _new_project(client, name="同名会议项目")
    mid1, min1 = _make_meeting_minute(pid, "confirmed")
    mid2, min2 = _make_meeting_minute(pid, "confirmed")  # 同标题"方案对接会"
    docs = []
    try:
        r1 = client.post(f"/api/reflow/minute/{min1}").json()
        r2 = client.post(f"/api/reflow/minute/{min2}").json()
        assert r1["status"] == "ok" and r2["status"] == "ok"
        # 两条独立文档,不因同名被误判 already
        assert r1["document_id"] != r2["document_id"]
        docs = [r1["document_id"], r2["document_id"]]
        # 各自再调一次 = already(幂等)
        assert client.post(f"/api/reflow/minute/{min1}").json()["status"] == "already"
    finally:
        db = SessionLocal()
        for d in docs:
            db.query(models.KnowledgeDocument).filter_by(id=d).delete()
        for m in (min1, min2):
            db.query(models.MeetingMinute).filter_by(id=m).delete()
        for mm in (mid1, mid2):
            db.query(models.Meeting).filter_by(id=mm).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()

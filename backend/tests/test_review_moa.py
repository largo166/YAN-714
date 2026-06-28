"""MoA 方案评审路由桩测（零成本：桩掉 chat_completion，不联网、不花钱）。

验证修完导入/字段/schema 后：FastAPI 能带新路由加载、三专家并发→聚合→落库→GET 回查全程不崩。
真·付费验证不在这里（单独跑）。
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import models, moa
from app.database import SessionLocal


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _set_key(v="sk-test"):
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1) or models.AppSetting(id=1)
        db.add(row)
        row.deepseek_api_key = v
        db.commit()
    finally:
        db.close()


def _new_project(client, name="MoA评审测试"):
    return client.post("/api/projects", json={"name": name, "status": "active"}).json()["id"]


def _fake_chat(messages, **kw):
    """假 LLM：聚合(主席)给 JSON，专家给文本。绝不联网。"""
    if "评审委员会主席" in messages[0]["content"]:
        return json.dumps({
            "overall_score": 82, "risk_level": "medium", "pass_rate": 0.8,
            "categories": [{"category": "function", "label": "功能匹配", "items": [
                {"item": "流线", "pass": True, "note": "ok", "severity": "low"}]}],
            "conflict_items": [], "next_steps": ["补充日照分析"],
        }, ensure_ascii=False)
    return "【问题1】示例问题【严重程度：medium】【建议修改方向】示例建议"


def test_review_moa_not_configured(client):
    """未配 DeepSeek key → 400 不伪造（不触达任何模型调用）。"""
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1) or models.AppSetting(id=1)
        db.add(row)
        row.deepseek_api_key = ""
        db.commit()
    finally:
        db.close()
    pid = _new_project(client)
    r = client.post("/api/review-checklist/moa", params={"project_id": pid})
    assert r.status_code == 400


def test_review_moa_stubbed_end_to_end(client, monkeypatch):
    """配 key + 桩 LLM → 三专家并发 → 聚合 JSON → 落 ProjectAnalysis → GET 回查，全程不崩、不联网。"""
    monkeypatch.setattr(moa, "chat_completion", _fake_chat)
    _set_key()
    pid = _new_project(client)
    r = client.post("/api/review-checklist/moa", params={"project_id": pid})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["checklist"]["overall_score"] == 82  # 聚合 JSON 被正确解析
    assert len(body["reference_details"]) == 3        # 三位专家都跑了
    assert all(d["status"] == "success" for d in body["reference_details"])
    assert "total_cost_yuan" in body["cost"]
    # GET 最新评审（验证字段名 content 修对了，json.loads 能回查）
    g = client.get(f"/api/review-checklist/{pid}")
    assert g.status_code == 200 and g.json()["success"] is True
    assert g.json()["checklist"]["overall_score"] == 82
    # 历史
    h = client.get(f"/api/review-checklist/{pid}/history")
    assert h.status_code == 200 and h.json()["count"] >= 1


def test_review_moa_unknown_project_404(client, monkeypatch):
    """未知项目 → 404（_build_review_input 守卫）。"""
    monkeypatch.setattr(moa, "chat_completion", _fake_chat)
    _set_key()
    r = client.post("/api/review-checklist/moa", params={"project_id": 999999})
    assert r.status_code == 404

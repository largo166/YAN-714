"""MoA 方案评审路由桩测（零成本：桩掉 chat_completion，不联网、不花钱）。

验证修完导入/字段/schema 后：FastAPI 能带新路由加载、三位评图人并发→聚合→落库→GET 回查全程不崩。
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
    """假 LLM：聚合调用给 JSON，专家给文本。绝不联网。"""
    if kw.get("response_format") == {"type": "json_object"}:
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
    """配 key + 桩 LLM → 三位评图人并发 → 聚合 JSON → 落 ProjectAnalysis → GET 回查，全程不崩、不联网。"""
    monkeypatch.setattr(moa, "chat_completion", _fake_chat)
    _set_key()
    pid = _new_project(client)
    r = client.post("/api/review-checklist/moa", params={"project_id": pid})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    assert body["checklist"]["overall_score"] == 82  # 聚合 JSON 被正确解析
    assert len(body["reference_details"]) == 3        # 本次评图(实时)能看到三位评图人原话…
    assert all(d["status"] == "success" for d in body["reference_details"])
    assert "total_cost_yuan" in body["cost"]
    # …但不落库:GET 回查只还原最终结论,评图过程/专家原话不持久化 → 回查不含 reference_details
    g = client.get(f"/api/review-checklist/{pid}")
    gb = g.json()
    assert g.status_code == 200 and gb["success"] is True
    assert gb["checklist"]["overall_score"] == 82
    assert "reference_details" not in gb  # 回查不含专家原话(评图过程不落库)
    # 历史
    h = client.get(f"/api/review-checklist/{pid}/history")
    assert h.status_code == 200 and h.json()["count"] >= 1


def test_review_moa_unknown_project_404(client, monkeypatch):
    """未知项目 → 404（_build_review_input 守卫）。"""
    monkeypatch.setattr(moa, "chat_completion", _fake_chat)
    _set_key()
    r = client.post("/api/review-checklist/moa", params={"project_id": 999999})
    assert r.status_code == 404


def test_review_moa_aggregator_failure_no_500(client, monkeypatch):
    """主审(reasoner)调用失败 → 不 500，返回可读错误 + 重试建议（不伪造）；三位评图人意见一并带回。"""
    from app import llm

    def _agg_fails(messages, **kw):
        if kw.get("response_format") == {"type": "json_object"}:
            raise llm.LLMError("reasoner timeout (stub)")
        return "专家意见(stub)"

    monkeypatch.setattr(moa, "chat_completion", _agg_fails)
    _set_key()
    pid = _new_project(client)
    r = client.post("/api/review-checklist/moa", params={"project_id": pid})
    assert r.status_code == 200  # 关键：聚合失败不冒成 500
    body = r.json()
    assert body["success"] is False
    assert body["error"]
    assert "重试" in body["retry_suggestion"]
    assert len(body["reference_details"]) == 3  # 已花的三次专家调用结果不浪费


def test_skill_card_moa_mode(client, monkeypatch):
    """技能卡 review 以 mode=moa 跑 → 走设计委员会分发，输出 MoA 结构化结果（不崩、不联网）。"""
    monkeypatch.setattr(moa, "chat_completion", _fake_chat)
    _set_key()
    pid = _new_project(client)
    # review 需 RAG：上传材料，否则 no_material
    client.post(f"/api/projects/{pid}/files",
                files={"file": ("方案.md", "# 方案\n概念：山水叙事，退台体量".encode("utf-8"), "text/markdown")})
    r = client.post(f"/api/projects/{pid}/skills/review/run", json={"input": "评审这版", "mode": "moa"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok" and body["skill_id"] == "review"
    data = json.loads(body["output_json"])
    assert data["success"] is True and "checklist" in data
    assert data["checklist"].get("overall_score") == 82       # 聚合 JSON 被解析
    assert "reference_details" not in data                    # 评图过程/专家原话不落库(只留最终结论)



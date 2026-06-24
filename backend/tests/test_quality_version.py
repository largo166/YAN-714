"""阶段6：隐形质检层(quality.audit_fields) + 版本层(认知重抽快照)测试。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app import models, quality, safe_json


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project(client, name="质检版本测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


# ── 隐形质检层 ──
def test_audit_clean_fields_no_warnings():
    fields = [
        {"key": "a", "label": "字段A", "extractable": "high", "value": "实值", "status": "confirmed",
         "source": {"type": "doc", "doc_ids": [3]}},
        {"key": "b", "label": "字段B", "extractable": "manual_only", "value": None, "status": "empty",
         "source": {"type": "manual", "doc_ids": []}, "guide": "请填"},
    ]
    assert quality.audit_fields(fields) == []


def test_audit_catches_confirmed_empty():
    fields = [{"key": "a", "label": "A", "extractable": "high", "value": "", "status": "confirmed",
               "source": {"type": "manual", "doc_ids": []}}]
    codes = {w["code"] for w in quality.audit_fields(fields)}
    assert "confirmed_empty" in codes


def test_audit_catches_judgment_confirmed_not_manual():
    """low/manual_only 被 confirmed 但来源非 manual → 警告(判断应人工审定)。"""
    fields = [{"key": "x", "label": "设计矛盾", "extractable": "low", "value": "矛盾", "status": "confirmed",
               "source": {"type": "inference", "doc_ids": []}}]
    codes = {w["code"] for w in quality.audit_fields(fields)}
    assert "judgment_not_manual" in codes


def test_audit_catches_doc_without_ids_and_nested_empty():
    fields = [
        {"key": "a", "label": "A", "extractable": "high", "value": "v", "status": "draft",
         "source": {"type": "doc", "doc_ids": []}},
        {"key": "b", "label": "B", "extractable": "medium", "value": ["真值", None, "  "], "status": "draft",
         "source": {"type": "doc", "doc_ids": [1]}},
    ]
    codes = {w["code"] for w in quality.audit_fields(fields)}
    assert "doc_without_ids" in codes
    assert "nested_empty" in codes


def test_audit_nested_empty_in_dict_object_field():
    """object 型字段(如 key_indicators)含 {k:None} 空壳也应被 nested_empty 捕获(不只 list)。"""
    fields = [{"key": "key_indicators", "label": "容积率/限高", "extractable": "high",
               "value": {"fsi": "2.5", "height_limit": None}, "status": "draft",
               "source": {"type": "doc", "doc_ids": [1]}}]
    codes = {w["code"] for w in quality.audit_fields(fields)}
    assert "nested_empty" in codes


def test_audit_warnings_in_cognition_output(client):
    """质检警告随认知输出自动出现(隐形)。"""
    pid = _new_project(client)
    db = SessionLocal()
    try:
        bad = {"key": "a", "label": "A", "type": "string", "extractable": "high", "value": "", "status": "confirmed",
               "source": {"type": "doc", "doc_ids": []}, "confidence": None, "guide": ""}
        db.add(models.ProjectCognition(project_id=pid, module="brief", module_label="任务书",
                                       fields_json=safe_json.dumps_safe([bad]),
                                       status="confirmed", module_status="partial", version=1))
        db.commit()
    finally:
        db.close()
    try:
        items = client.get(f"/api/projects/{pid}/cognition").json()
        assert items and len(items[0]["quality_warnings"]) >= 1
    finally:
        db = SessionLocal()
        db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


# ── 版本层 ──
def test_version_snapshot_on_reextract(client, monkeypatch):
    """重抽前旧版本被快照,历史不丢；versions 端点可回看。"""
    import app.routers.cognition as cog_router
    from app import analysis

    pid = _new_project(client, name="版本快照项目")
    # 预置一条已有认知(模拟首次抽取结果)
    db = SessionLocal()
    try:
        f1 = {"key": "project_name", "label": "项目名称", "type": "string", "extractable": "high",
              "value": "初版项目名", "status": "draft",
              "source": {"type": "doc", "doc_ids": [1]}, "confidence": 0.8, "guide": ""}
        cog = models.ProjectCognition(project_id=pid, module="brief", module_label="任务书",
                                      fields_json=safe_json.dumps_safe([f1]), summary_md="初版摘要",
                                      status="draft", module_status="draft", version=1)
        db.add(cog)
        db.commit()
        db.refresh(cog)
        cog_id = cog.id
    finally:
        db.close()

    # 桩掉 LLM + gather_material,触发"重抽"覆盖
    monkeypatch.setattr(cog_router.llm, "chat_completion",
                        lambda *a, **k: '{"project_name":"二版项目名","_summary":"二版摘要"}')

    class _Mat:
        empty = False
        context = "材料"
        sources = []
    monkeypatch.setattr(cog_router.analysis, "gather_material", lambda *a, **k: _Mat())
    monkeypatch.setattr(cog_router.analysis, "sources_as_dicts", lambda s: [])
    # 配 key
    db = SessionLocal()
    try:
        row = db.get(models.AppSetting, 1) or models.AppSetting(id=1)
        if row.id is None:
            db.add(row)
        row.deepseek_api_key = "sk-test"
        db.merge(row)
        db.commit()
    finally:
        db.close()

    try:
        r = client.post(f"/api/projects/{pid}/cognition/brief/extract").json()
        assert r["status"] == "ok"
        assert r["cognition"]["version"] == 2  # 版本号递增
        # 历史快照里存着初版
        vers = client.get(f"/api/projects/{pid}/cognition/{cog_id}/versions").json()
        assert len(vers) == 1
        assert vers[0]["version"] == 1
        assert vers[0]["summary_md"] == "初版摘要"
        names = [f["value"] for f in vers[0]["fields"] if f["key"] == "project_name"]
        assert names == ["初版项目名"]  # 旧值被保存,未丢
    finally:
        db = SessionLocal()
        db.query(models.ProjectCognitionVersion).filter_by(cognition_id=cog_id).delete()
        db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        row = db.get(models.AppSetting, 1)
        if row:
            row.deepseek_api_key = ""
        db.commit()
        db.close()


def test_confirm_snapshots_prior_draft(client):
    """人工确认前的 AI 草案被快照存档(可回退,版本层覆盖 confirm,不只 re-extract)。"""
    pid = _new_project(client, name="确认快照项目")
    db = SessionLocal()
    try:
        f = {"key": "project_name", "label": "项目名称", "type": "string", "extractable": "high",
             "value": "草案名", "status": "draft",
             "source": {"type": "doc", "doc_ids": [1]}, "confidence": 0.8, "guide": ""}
        cog = models.ProjectCognition(project_id=pid, module="brief", module_label="任务书",
                                      fields_json=safe_json.dumps_safe([f]), summary_md="草案摘要",
                                      status="draft", module_status="draft", version=1)
        db.add(cog)
        db.commit()
        db.refresh(cog)
        cog_id = cog.id
    finally:
        db.close()
    try:
        client.post(f"/api/projects/{pid}/cognition/{cog_id}/confirm")
        vers = client.get(f"/api/projects/{pid}/cognition/{cog_id}/versions").json()
        assert len(vers) == 1
        assert vers[0]["snapshot_reason"] == "confirm"
        # 快照里字段仍是确认前的 draft 状态
        assert vers[0]["fields"][0]["status"] == "draft"
    finally:
        db = SessionLocal()
        db.query(models.ProjectCognitionVersion).filter_by(cognition_id=cog_id).delete()
        db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()

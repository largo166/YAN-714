"""B 类跨项目复用库测试（阶段3）：沉淀只接受已确认认知、全局可检索、不伪造。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app import models, safe_json


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project(client, name="跨项目库测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def _make_cognition(project_id, fields):
    db = SessionLocal()
    try:
        cog = models.ProjectCognition(
            project_id=project_id, module="design_concept", module_label="概念生成",
            fields_json=safe_json.dumps_safe(fields), summary_md="电竞主题地产概念",
            status="confirmed", module_status="partial", version=1,
        )
        db.add(cog)
        db.commit()
        db.refresh(cog)
        return cog.id
    finally:
        db.close()


def test_list_types(client):
    r = client.get("/api/cross-project/types")
    assert r.status_code == 200
    types = {t["type"]: t for t in r.json()}
    assert set(types) == {"case_study", "spatial_strategy", "massing_operation", "representation", "typology", "design_method"}
    assert types["case_study"]["label"] == "案例库"


def test_precipitate_unknown_type_404(client):
    pid = _new_project(client)
    r = client.post("/api/cross-project/precipitate", json={"project_id": pid, "cog_id": 1, "cross_type": "bogus"})
    assert r.status_code == 404


def test_precipitate_no_confirmed_returns_empty(client):
    """认知里没有已确认字段 → empty，不写库（不伪造可复用资产）。"""
    pid = _new_project(client)
    cog_id = _make_cognition(pid, [
        {"key": "core_problem", "label": "核心设计问题", "type": "string", "extractable": "low",
         "value": "如何融合电竞与居住", "status": "draft",  # 仅 draft,未确认
         "source": {"type": "inference", "doc_ids": [], "based_on": [], "doc_location": ""},
         "confidence": 0.4, "guide": ""},
    ])
    try:
        r = client.post("/api/cross-project/precipitate", json={"project_id": pid, "cog_id": cog_id, "cross_type": "design_method"})
        assert r.status_code == 200
        assert r.json()["status"] == "empty"
        # 未写入跨项目库
        lib = client.get("/api/cross-project/library").json()
        assert all(it["document_id"] != r.json().get("item") for it in lib)
    finally:
        db = SessionLocal()
        db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


def test_precipitate_confirmed_then_cross_project_searchable(client):
    """已确认认知沉淀 → ok，落跨项目库且带出处，全局可检索（任意项目复用）。"""
    pid = _new_project(client, name="三亚电竞地产")
    cog_id = _make_cognition(pid, [
        {"key": "design_intent", "label": "设计意图/主张", "type": "string", "extractable": "low",
         "value": "退台式立面呼应海景并整合电竞流量", "status": "confirmed",
         "source": {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": "人工填写"},
         "confidence": None, "guide": ""},
        {"key": "concept_keywords", "label": "概念关键词", "type": "array", "extractable": "low",
         "value": ["草案专属词XYZ"], "status": "draft",  # draft 不应被沉淀(用独特词便于检测)
         "source": {"type": "inference", "doc_ids": [], "based_on": [], "doc_location": ""},
         "confidence": 0.4, "guide": ""},
    ])
    doc_id = None
    try:
        r = client.post("/api/cross-project/precipitate", json={
            "project_id": pid, "cog_id": cog_id, "cross_type": "spatial_strategy",
        }).json()
        assert r["status"] == "ok"
        item = r["item"]
        doc_id = item["document_id"]
        assert item["cross_type"] == "spatial_strategy"
        assert item["label"] == "空间策略"
        assert "三亚电竞地产" in item["resource"]      # 带源项目出处
        assert "退台式立面呼应海景" in item["snippet"]   # confirmed 字段进正文
        assert "草案专属词XYZ" not in item["snippet"]    # draft 字段不沉淀(不伪造)

        # 出现在跨项目库 + 按类别过滤
        lib = client.get("/api/cross-project/library?cross_type=spatial_strategy").json()
        assert any(it["document_id"] == doc_id for it in lib)

        # 全局检索可命中（跨项目复用：不限项目范围）
        sr = client.post("/api/knowledge/search", json={"query": "退台 海景 空间策略", "top_k": 5})
        assert any(h["document_id"] == doc_id for h in sr.json()["hits"])
    finally:
        db = SessionLocal()
        if doc_id:
            db.query(models.KnowledgeDocument).filter_by(id=doc_id).delete()
        db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


def test_precipitate_draft_summary_not_leaked(client):
    """module_status=partial(非全确认)时,draft 期 AI 生成的 summary_md 不进沉淀内容(不伪造未审定内容)。"""
    pid = _new_project(client, name="摘要泄漏测试")
    cog_id = _make_cognition(pid, [
        {"key": "design_intent", "label": "设计意图/主张", "type": "string", "extractable": "low",
         "value": "已确认的真实意图XYZ", "status": "confirmed",
         "source": {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": "人工填写"},
         "confidence": None, "guide": ""},
    ])
    # _make_cognition 写的 summary_md="电竞主题地产概念"、module_status="partial"(非 confirmed)
    doc_id = None
    try:
        r = client.post("/api/cross-project/precipitate", json={
            "project_id": pid, "cog_id": cog_id, "cross_type": "design_method",
        }).json()
        assert r["status"] == "ok"
        doc_id = r["item"]["document_id"]
        # 取库条目正文核对
        db = SessionLocal()
        doc = db.get(models.KnowledgeDocument, doc_id)
        content = doc.content_text
        db.close()
        assert "已确认的真实意图XYZ" in content        # 确认字段进正文
        assert "电竞主题地产概念" not in content        # partial 模块的 draft summary 不泄漏
    finally:
        db = SessionLocal()
        if doc_id:
            db.query(models.KnowledgeDocument).filter_by(id=doc_id).delete()
        db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
        db.query(models.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()

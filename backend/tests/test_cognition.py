"""项目结构化认知(任务书脊椎)端点测试。无 key 环境只断言三态契约,不依赖真实 LLM。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project(client, name="认知脊椎测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def test_extract_brief_unknown_project_404(client):
    r = client.post("/api/projects/999999/cognition/brief/extract")
    assert r.status_code == 404


def test_extract_brief_no_material(client):
    """空项目(无文件无命中): 有 key→no_material; 无 key→not_configured。均不写库。"""
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/cognition/brief/extract")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in {"no_material", "not_configured"}
    assert body["cognition"] is None  # 未写库
    # 列表应为空
    lst = client.get(f"/api/projects/{pid}/cognition")
    assert lst.json() == []


def test_list_cognition_empty(client):
    pid = _new_project(client)
    r = client.get(f"/api/projects/{pid}/cognition")
    assert r.status_code == 200
    assert r.json() == []


def test_confirm_unknown_cognition_404(client):
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/cognition/999999/confirm")
    assert r.status_code == 404


def test_current_stage_default_brief(client):
    """新项目 current_stage 默认 brief(工作流起点)。"""
    pid = _new_project(client)
    p = client.get(f"/api/projects/{pid}").json()
    assert p.get("current_stage", "brief") == "brief"


def test_confirmed_cognition_injected_into_gather_material():
    """已确认认知被 gather_material 置顶注入(共创营地/研判推演据此分析)——修最致命断点。"""
    from app.database import SessionLocal
    from app import models, analysis, safe_json

    db = SessionLocal()
    try:
        proj = models.Project(name="认知注入回归测试", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        cog = models.ProjectCognition(
            project_id=proj.id, module="brief",
            fields_json=safe_json.dumps_safe({"设计矛盾": "高容积率与居住品质"}),
            summary_md="测试摘要", status="confirmed", version=1,
        )
        db.add(cog)
        db.commit()
        m = analysis.gather_material(db, proj.id, query="设计要点", top_k=5)
        assert not m.empty  # 认知即材料
        assert any(s.kind == "cognition" for s in m.sources)
        assert "已确认的结构化认知" in m.context
        assert "高容积率与居住品质" in m.context
        # draft 不应注入
        cog.status = "draft"
        db.commit()
        m2 = analysis.gather_material(db, proj.id, query="设计要点", top_k=5)
        assert not any(s.kind == "cognition" for s in m2.sources)
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()

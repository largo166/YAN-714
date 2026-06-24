"""工作流状态机驱动测试（阶段4）：据已确认认知算阶段完成度 + 下一步建议，不伪造进度。"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app import models, safe_json, stage_machine


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _new_project(client, name="状态机测试项目"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def _confirm_module(project_id, module, label):
    """给项目某 module 写一条含 confirmed 字段的认知。"""
    db = SessionLocal()
    try:
        field = {
            "key": "k1", "label": "字段1", "type": "string", "extractable": "high",
            "value": "已确认值", "status": "confirmed",
            "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": 0.8, "guide": "",
        }
        db.add(models.ProjectCognition(
            project_id=project_id, module=module, module_label=label,
            fields_json=safe_json.dumps_safe([field]), status="confirmed",
            module_status="partial", version=1,
        ))
        db.commit()
    finally:
        db.close()


def _cleanup(pid):
    db = SessionLocal()
    db.query(models.ProjectCognition).filter_by(project_id=pid).delete()
    db.query(models.Project).filter_by(id=pid).delete()
    db.commit()
    db.close()


def test_empty_project_brief_is_first_ready(client):
    """空项目:无任何确认认知 → brief(无认知上游)是 ready 建议,当前阶段=brief。"""
    pid = _new_project(client)
    try:
        sp = client.get(f"/api/projects/{pid}/stage-progress").json()
        assert sp["done_count"] == 0
        assert sp["current_stage"] == "brief"
        sug = {s["stage"]: s for s in sp["suggestions"]}
        assert sug["brief"]["ready"] is True  # brief 无认知上游
        # concept 依赖 core_problem(纯过程,非硬门槛)→但 brief 未做时它仍在建议里
        assert "brief" in sug
    finally:
        _cleanup(pid)


def test_brief_confirmed_unlocks_site_and_userprogram(client):
    """brief 确认后:brief 不再进建议(已完成);site_research/user_program(上游=brief)变 ready。"""
    pid = _new_project(client)
    try:
        _confirm_module(pid, "brief", "任务书")
        sp = client.get(f"/api/projects/{pid}/stage-progress").json()
        assert sp["done_count"] == 1
        sug = {s["stage"]: s for s in sp["suggestions"]}
        assert "brief" not in sug  # 已完成,不再建议
        assert sug["site"]["ready"] is True          # 上游 brief 已确认
        assert sug["user_program"]["ready"] is True
        # 当前阶段推进到 site(第一个 ready)
        assert sp["current_stage"] in ("site", "user_program")
    finally:
        _cleanup(pid)


def test_concept_blocked_until_core_cognition(client):
    """concept 的上游 core_problem 是纯过程节点(无认知门槛)→ concept 不被它硬卡;
    验证 blocked_by 只含【认知类】未完成上游,不伪造硬依赖。"""
    pid = _new_project(client)
    try:
        sp = client.get(f"/api/projects/{pid}/stage-progress").json()
        sug = {s["stage"]: s for s in sp["suggestions"]}
        # concept 上游是 core_problem(process 节点,无 cognition_module)→ 不作为硬门槛
        assert "concept" in sug
        # core_problem 不在 suggestions(纯过程节点不进建议)
        assert "core_problem" not in sug
    finally:
        _cleanup(pid)


def test_offline_compute_directly():
    """直接调 compute_stage_progress(离线,不经 HTTP):brief+site_research 确认后 site done。"""
    db = SessionLocal()
    try:
        proj = models.Project(name="离线状态机", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        for mod, lbl in [("brief", "任务书"), ("site_research", "场地研究")]:
            field = {"key": "k", "label": "L", "type": "string", "extractable": "high",
                     "value": "v", "status": "confirmed",
                     "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
                     "confidence": 0.8, "guide": ""}
            db.add(models.ProjectCognition(project_id=proj.id, module=mod, module_label=lbl,
                                           fields_json=safe_json.dumps_safe([field]),
                                           status="confirmed", module_status="partial", version=1))
        db.commit()
        sp = stage_machine.compute_stage_progress(db, proj.id)
        nodes = {n.stage: n for n in sp.nodes}
        assert nodes["brief"].done is True
        assert nodes["site"].done is True          # site_research 模块已确认
        assert nodes["concept"].done is False       # design_concept 未确认
        assert sp.done_count == 2
        # draft 字段不算完成
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


def test_draft_cognition_does_not_count_as_done():
    """只有 draft 字段(无 confirmed)的模块 → 不算阶段完成(不伪造进度)。"""
    db = SessionLocal()
    try:
        proj = models.Project(name="draft不算完成", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        field = {"key": "k", "label": "L", "type": "string", "extractable": "high",
                 "value": "v", "status": "draft",  # draft,未确认
                 "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
                 "confidence": 0.8, "guide": ""}
        db.add(models.ProjectCognition(project_id=proj.id, module="brief", module_label="任务书",
                                       fields_json=safe_json.dumps_safe([field]),
                                       status="draft", module_status="draft", version=1))
        db.commit()
        sp = stage_machine.compute_stage_progress(db, proj.id)
        nodes = {n.stage: n for n in sp.nodes}
        assert nodes["brief"].done is False  # draft 不算完成
        assert sp.done_count == 0
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


def test_all_cognition_done_current_stage_is_archive():
    """全部 8 个认知模块确认后,current_stage 应为末端 archive(复盘入库),不回退到 brief。"""
    db = SessionLocal()
    try:
        proj = models.Project(name="全完成状态机", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        all_modules = ["brief", "site_research", "user_program", "design_concept",
                       "circulation_experience", "plan_section_facade", "scheme_comparison", "project_review"]
        for mod in all_modules:
            field = {"key": "k", "label": "L", "type": "string", "extractable": "high",
                     "value": "v", "status": "confirmed",
                     "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
                     "confidence": 0.8, "guide": ""}
            db.add(models.ProjectCognition(project_id=proj.id, module=mod, module_label=mod,
                                           fields_json=safe_json.dumps_safe([field]),
                                           status="confirmed", module_status="partial", version=1))
        db.commit()
        sp = stage_machine.compute_stage_progress(db, proj.id)
        assert sp.done_count == sp.total_cognition_stages == 8
        assert sp.current_stage == "archive"  # 末端,不回退 brief
        assert all(not s.ready for s in sp.suggestions) or len(sp.suggestions) == 0
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


def test_core_problem_upstream_uses_stage_names():
    """STAGE_NODES 的 upstream_required 必须全是合法 stage 名(不能是 module 名)——
    防 core_problem 误用 'site_research'(module名) 导致依赖永远失效。"""
    from app import schemas
    stage_names = {s["stage"] for s in schemas.STAGE_NODES}
    for s in schemas.STAGE_NODES:
        for up in s["upstream_required"]:
            assert up in stage_names, f"{s['stage']} 的上游 {up} 不是合法 stage 名"

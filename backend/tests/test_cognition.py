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
    """已确认字段被 gather_material 注入(规格1.5: 仅 status=confirmed 字段)；draft/empty 不注入——修最致命断点。"""
    from app.database import SessionLocal
    from app import models, analysis, safe_json

    db = SessionLocal()
    try:
        proj = models.Project(name="认知注入回归测试", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        confirmed_field = {
            "key": "design_conflicts", "label": "设计矛盾", "type": "array", "extractable": "low",
            "value": ["高容积率与居住品质"], "status": "confirmed",
            "source": {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": None, "guide": "",
        }
        draft_field = {
            "key": "building_scale", "label": "建筑规模", "type": "string", "extractable": "high",
            "value": "用地3公顷", "status": "draft",
            "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": 0.8, "guide": "",
        }
        cog = models.ProjectCognition(
            project_id=proj.id, module="brief", module_label="任务书",
            fields_json=safe_json.dumps_safe([confirmed_field, draft_field]),
            summary_md="测试摘要", status="confirmed", module_status="partial", version=1,
        )
        db.add(cog)
        db.commit()
        m = analysis.gather_material(db, proj.id, query="设计要点", top_k=5)
        assert not m.empty
        assert any(s.kind == "cognition" for s in m.sources)
        assert "已确认认知" in m.context
        assert "高容积率与居住品质" in m.context  # confirmed 字段注入
        assert "用地3公顷" not in m.context        # draft 字段不注入
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


def test_cognition_system_prompt_for_chat_path():
    """上下文供给协议(阶段1)：confirmed 认知能经 cognition_system_prompt 注入对话路径；
    draft 不注入；无确认认知→空(不造空壳)。修「共创营地对话拿不到认知」的脊椎断点。"""
    from app.database import SessionLocal
    from app import models, analysis, safe_json

    db = SessionLocal()
    try:
        # 无认知 → 空
        proj = models.Project(name="对话注入测试", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        text0, src0 = analysis.cognition_system_prompt(db, proj.id)
        assert text0 == "" and src0 == []

        confirmed_field = {
            "key": "site_location", "label": "基地位置", "type": "string", "extractable": "high",
            "value": "三亚海棠湾", "status": "confirmed",
            "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": 0.8, "guide": "",
        }
        draft_field = {
            "key": "design_conflicts", "label": "设计矛盾", "type": "array", "extractable": "low",
            "value": ["造价与品质矛盾"], "status": "draft",
            "source": {"type": "inference", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": 0.4, "guide": "",
        }
        cog = models.ProjectCognition(
            project_id=proj.id, module="brief", module_label="任务书",
            fields_json=safe_json.dumps_safe([confirmed_field, draft_field]),
            summary_md="电竞主题地产", status="confirmed", module_status="partial", version=1,
        )
        db.add(cog)
        db.commit()
        text1, src1 = analysis.cognition_system_prompt(db, proj.id)
        assert "已确认的结构化认知" in text1
        assert "三亚海棠湾" in text1          # confirmed 注入对话
        assert "造价与品质矛盾" not in text1   # draft 不注入
        assert any(s.kind == "cognition" for s in src1)
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


def test_cognition_nested_empty_value_not_injected():
    """嵌套空壳值([None]/{'k':None}/['  '])即便 status=confirmed 也不注入——
    避免被 str() 成 '[None]' 当真实认知喂 LLM（不伪造，对抗复核坐实点）。"""
    from app.database import SessionLocal
    from app import models, analysis, safe_json

    db = SessionLocal()
    try:
        proj = models.Project(name="嵌套空壳测试", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        hollow = {
            "key": "program_composition", "label": "功能构成", "type": "array", "extractable": "medium",
            "value": [None, "  "], "status": "confirmed",  # 嵌套空壳
            "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": 0.6, "guide": "",
        }
        real = {
            "key": "site_location", "label": "基地位置", "type": "string", "extractable": "high",
            "value": "海棠湾", "status": "confirmed",
            "source": {"type": "doc", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": 0.8, "guide": "",
        }
        cog = models.ProjectCognition(
            project_id=proj.id, module="brief", module_label="任务书",
            fields_json=safe_json.dumps_safe([hollow, real]),
            summary_md="", status="confirmed", module_status="confirmed", version=1,
        )
        db.add(cog)
        db.commit()
        text1, _ = analysis.cognition_system_prompt(db, proj.id)
        assert "海棠湾" in text1        # 真实值注入
        assert "None" not in text1      # 嵌套空壳不泄漏为 "[None]"
        assert "功能构成" not in text1   # 空壳字段整条不出现
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


def test_extract_brief_field_grading_offline():
    """离线验证字段分档装配(_build_field_records)：manual_only 留空带引导、low draft 不 confirmed、high 带出处。"""
    from app.routers.cognition import _build_field_records
    from app import schemas

    recs = _build_field_records(
        schemas.BRIEF_FIELD_SPECS, schemas.MANUAL_GUIDE,
        {"project_name": "测试项目", "building_type": "住宅", "design_conflicts": ["矛盾A"]},
        doc_ids=[7],
    )
    by_key = {r["key"]: r for r in recs}
    assert len(recs) == 17
    # high 字段有值 → draft + doc 出处
    assert by_key["building_type"]["status"] == "draft"
    assert by_key["building_type"]["source"]["type"] == "doc"
    assert by_key["building_type"]["source"]["doc_ids"] == [7]
    # low 字段 → draft + inference，绝不 confirmed
    assert by_key["design_conflicts"]["status"] == "draft"
    assert by_key["design_conflicts"]["source"]["type"] == "inference"
    # manual_only → empty + 引导问题，不填值
    assert by_key["value_creation_problems"]["status"] == "empty"
    assert by_key["value_creation_problems"]["value"] is None
    assert by_key["value_creation_problems"]["guide"]
    assert by_key["design_entry_point"]["status"] == "empty"
    # 未抽到的 high 字段 → empty
    assert by_key["site_location"]["status"] == "empty"


def test_all_a_modules_have_specs_and_guides():
    """A1-A8 八个模块都已实现：有字段表、manual_only 字段都配了引导问题（阶段2）。"""
    from app import schemas

    impl = [m for m, v in schemas.COGNITION_MODULES.items() if v["implemented"]]
    assert len(impl) == 8  # A1-A8 全实现
    for m in impl:
        specs = schemas.module_field_specs(m)
        assert specs, f"{m} 无字段表"
        guides = schemas.module_guides(m)
        for f in specs:
            if f["extractable"] == "manual_only":
                assert guides.get(f["key"]), f"{m}.{f['key']} 缺引导问题"
            # 每字段四档之一
            assert f["extractable"] in ("high", "medium", "low", "manual_only")


def test_build_field_records_generic_module():
    """通用装配对非 brief 模块同样分档正确（以 site_research 为例）。"""
    from app.routers.cognition import _build_field_records
    from app import schemas

    specs = schemas.module_field_specs("site_research")
    guides = schemas.module_guides("site_research")
    recs = _build_field_records(
        specs, guides,
        {"topography": "缓坡地，最大高差8米", "site_opportunities": ["南向景观面"]},
        doc_ids=[3],
    )
    by = {r["key"]: r for r in recs}
    assert by["topography"]["status"] == "draft" and by["topography"]["source"]["type"] == "doc"
    assert by["site_opportunities"]["source"]["type"] == "inference"  # low→推理
    assert by["site_strategy_stance"]["status"] == "empty"            # manual_only 留空
    assert by["site_strategy_stance"]["guide"]                        # 带引导问题
    assert by["surroundings"]["status"] == "empty"                   # 未抽到→empty


def test_list_modules_endpoint(client):
    pid = _new_project(client)
    r = client.get(f"/api/projects/{pid}/cognition/modules")
    assert r.status_code == 200
    mods = {m["module"]: m for m in r.json()["modules"]}
    assert mods["site_research"]["implemented"] is True
    assert mods["brief"]["label"] == "任务书"


def test_extract_unknown_module_404(client):
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/cognition/bogus_module/extract")
    assert r.status_code == 404


def test_extract_a2_no_material_or_not_configured(client):
    """A2 场地研究空项目抽取：有key→no_material;无key→not_configured。均不写库（与A1同契约）。"""
    pid = _new_project(client)
    r = client.post(f"/api/projects/{pid}/cognition/site_research/extract")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in {"no_material", "not_configured"}
    assert body["cognition"] is None
    assert client.get(f"/api/projects/{pid}/cognition").json() == []


def test_update_rejects_empty_confirm_and_cleans_manual_only():
    """update 红线：空值不能置 confirmed；manual_only 人工填值并确认后清掉 guide/confidence（规格1.2-1.3）。"""
    from app.database import SessionLocal
    from app import models, safe_json
    from app.routers.cognition import update_cognition

    db = SessionLocal()
    try:
        proj = models.Project(name="update红线测试", status="active")
        db.add(proj)
        db.commit()
        db.refresh(proj)
        manual_field = {
            "key": "design_entry_point", "label": "方案切入点", "type": "string", "extractable": "manual_only",
            "value": None, "status": "empty",
            "source": {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": None, "guide": "你打算从哪个角度切入？",
        }
        cog = models.ProjectCognition(
            project_id=proj.id, module="brief", module_label="任务书",
            fields_json=safe_json.dumps_safe([manual_field]),
            status="draft", module_status="empty", version=1,
        )
        db.add(cog)
        db.commit()
        db.refresh(cog)

        # 空值置 confirmed → 400
        from fastapi import HTTPException
        try:
            update_cognition(proj.id, cog.id, {"design_entry_point": {"value": "", "status": "confirmed"}}, db)
            assert False, "空值确认应被拒"
        except HTTPException as e:
            assert e.status_code == 400

        # 人工填值确认 → guide/confidence 清空
        out = update_cognition(proj.id, cog.id, {"design_entry_point": {"value": "以退台呼应海景", "status": "confirmed"}}, db)
        f = next(x for x in out.fields if x.key == "design_entry_point")
        assert f.status == "confirmed"
        assert f.value == "以退台呼应海景"
        assert f.guide == ""             # 引导问题已清
        assert f.confidence is None      # manual_only confidence 恒 null
        assert f.source.type == "manual"
    finally:
        db.query(models.ProjectCognition).filter_by(project_id=proj.id).delete()
        db.query(models.Project).filter_by(id=proj.id).delete()
        db.commit()
        db.close()


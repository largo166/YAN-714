"""P1-1 资料类型 v2 回归守卫(2026-07-09)。
锁双轴分离与规则表:同一格式按名分不同语义类;低置信兜底'其他';旧七类映射写死;
入库链路(_doc_from_file/create_document)自动填 design_doc_type;迁移后旧库读不炸。"""
import pytest
from fastapi.testclient import TestClient

from app import doc_type_rules as R
from app.main import app


# ═══ 纯函数:格式轴 ═══

def test_file_format_mapping():
    assert R.file_format_of("总图.pdf") == "pdf"
    assert R.file_format_of("汇报.PPTX") == "ppt"
    assert R.file_format_of("台账.xlsx") == "excel"
    assert R.file_format_of("鸟瞰.jpg") == "image"
    assert R.file_format_of("地库.dwg") == "dwg"
    assert R.file_format_of("体块.skp") == "skp"
    assert R.file_format_of("说明.md") == "txt"
    assert R.file_format_of("奇怪文件.xyz") == "unknown"
    assert R.file_format_of("") == "unknown"


# ═══ 纯函数:语义轴——两轴分离的核心用例 ═══

def test_same_pdf_different_semantics():
    """同一 pdf 格式,按名分 规范 vs 汇报 vs 图纸——一个 doc_type 装不下两轴的实证。"""
    assert R.infer_design_type("襄阳市城市规划管理技术规定.pdf").dtype == "规范"
    assert R.infer_design_type("20260705_SJZ_方案_汇报文本_甲方会.pdf").dtype == "汇报"
    assert R.infer_design_type("彩色总平面图.pdf").dtype == "图纸"


def test_jpg_render_vs_plan_screenshot():
    """jpg 可能是效果图也可能是总图截图——名称关键词分开。"""
    assert R.infer_design_type("社区入口夜景.jpg").dtype == "效果图"
    assert R.infer_design_type("鸟瞰人视.jpg").dtype == "效果图"
    assert R.infer_design_type("总平面截图.jpg").dtype == "图纸"
    assert R.infer_design_type("现场踏勘照片.jpg").dtype == "现场资料"


def test_pptx_bid_vs_generic():
    """pptx 有'汇报'名→汇报(高置信);无语义名→演示(纯格式兜底,低置信)。"""
    v1 = R.infer_design_type("投标述标文件.pptx")
    assert v1.dtype == "汇报" and v1.confidence == "high"
    v2 = R.infer_design_type("20260701内部研究.pptx")
    assert v2.dtype == "演示" and v2.confidence == "low"


def test_strong_keywords_per_type():
    assert R.infer_design_type("委托设计合同-final.docx").dtype == "合同"
    assert R.infer_design_type("项目成本测算表.xlsx").dtype == "成本"
    assert R.infer_design_type("评审会纪要0705.docx").dtype == "会议"
    assert R.infer_design_type("设计任务书.pdf").dtype == "甲方资料"
    assert R.infer_design_type("白模体块.skp").dtype == "模型"
    assert R.infer_design_type("对标案例研究.pdf").dtype == "案例"
    assert R.infer_design_type("出图工作流SOP.md").dtype == "方法"
    assert R.infer_design_type("面积指标表.xlsx").dtype == "表格"
    assert R.infer_design_type("方案设计说明.docx").dtype == "文本"


def test_dir_hint_participates():
    """目录名也是信号(名字即元数据):文件名无信号但目录带'效果图'。"""
    v = R.infer_design_type("IMG_2041.jpg", dir_hint="市庄路/03_效果图/IMG_2041.jpg")
    assert v.dtype == "效果图"


def test_content_head_needs_two_hits():
    """内容关键词须≥2共现才判(单个易误伤)。"""
    v1 = R.infer_design_type("扫描件.pdf", content_head="第一条 本规定适用于…… 第二条 …本规范…")
    assert v1.dtype == "规范" and v1.confidence == "high"
    v2 = R.infer_design_type("扫描件.pdf", content_head="仅出现 第一条 一次,无其它信号")
    assert v2.dtype == "其他"  # 单命中不判


def test_low_confidence_fallback_other():
    """无信号→其他/low(宁可未归类不错归类);dwg 无名称信号→图纸但低置信。"""
    v = R.infer_design_type("asdf.txt")
    assert v.dtype == "其他" and v.confidence == "low"
    v2 = R.infer_design_type("xyz.dwg")
    assert v2.dtype == "图纸" and v2.confidence == "low"


def test_legacy_map_seven_to_sixteen():
    """旧七类映射写死,逐条锁。"""
    assert R.migrate_legacy_type("任务书") == "甲方资料"
    assert R.migrate_legacy_type("会议纪要") == "会议"
    assert R.migrate_legacy_type("方案文本") == "文本"
    assert R.migrate_legacy_type("图纸") == "图纸"
    assert R.migrate_legacy_type("案例") == "案例"
    assert R.migrate_legacy_type("方法") == "方法"
    assert R.migrate_legacy_type("其他") == "其他"
    assert R.migrate_legacy_type("") == "其他"
    assert R.migrate_legacy_type("野值") == "其他"


def test_legacy_map_english_internal_types():
    """A1(2026-07-09 已批裁决):回流/沉淀英文内部类型六键,归属逐条锁——
    spatial_strategy/massing_operation/representation→方法;typology→案例;
    case_study→案例;design_method→方法。"""
    assert R.migrate_legacy_type("case_study") == "案例"
    assert R.migrate_legacy_type("typology") == "案例"
    assert R.migrate_legacy_type("design_method") == "方法"
    assert R.migrate_legacy_type("spatial_strategy") == "方法"
    assert R.migrate_legacy_type("massing_operation") == "方法"
    assert R.migrate_legacy_type("representation") == "方法"


def test_sixteen_types_complete():
    assert len(R.DESIGN_DOC_TYPES) == 16
    assert set(R.LEGACY_TYPE_MAP.values()) <= set(R.DESIGN_DOC_TYPES)
    for rule in R.RULES:
        assert rule.dtype in R.DESIGN_DOC_TYPES


# ═══ 链路:入库自动填 + 双轨读 ═══

@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_upload_fills_design_type_and_search_groups(client):
    """真实上传→索引→检索:hit 带 design_doc_type;手动建档同样自动推断。"""
    p = client.post("/api/projects", json={"name": "P11-测试项目"}).json()
    f = client.post(
        f"/api/projects/{p['id']}/files",
        files={"file": ("评审会纪要0708.txt", "参会:全体。会议时间:周二。结论:通过。".encode("utf-8"), "text/plain")},
    ).json()
    r = client.post(f"/api/projects/{p['id']}/files/{f['id']}/index")
    assert r.status_code == 200
    doc = client.get(f"/api/knowledge/documents/{r.json()['document_id']}").json()
    assert doc["design_doc_type"] == "会议"
    assert doc["design_type_confirmed"] is False
    # 检索 hit 带新轴
    s = client.post("/api/knowledge/search", json={"query": "纪要", "top_k": 10}).json()
    mine = [h for h in s["hits"] if h["document_id"] == doc["id"]]
    assert mine and mine[0]["design_doc_type"] == "会议"


def test_manual_create_infers_design_type(client):
    r = client.post("/api/knowledge/documents", json={"title": "社区入口夜景效果图说明", "content_text": "x"})
    assert r.status_code == 201
    assert r.json()["design_doc_type"] == "效果图"


def test_legacy_rows_read_fallback(client):
    """存量行(design_doc_type 为空)检索时按旧类映射兜底——双轨读不炸不漏。"""
    from app.database import SessionLocal
    from app import models, retrieval

    db = SessionLocal()
    try:
        doc = models.KnowledgeDocument(
            title="老库任务书遗留.pdf", content_text="设计要求 建设单位", type="任务书",
            design_doc_type="",  # 模拟迁移前存量
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        retrieval.index_one(db, doc.id, doc.title, doc.content_text, "")
        did = doc.id
    finally:
        db.close()
    s = client.post("/api/knowledge/search", json={"query": "任务书遗留", "top_k": 10}).json()
    mine = [h for h in s["hits"] if h["document_id"] == did]
    assert mine and mine[0]["design_doc_type"] == "甲方资料"  # 旧'任务书'→映射


# ═══ A1/A2(2026-07-09 已批):回流/沉淀构造点带语义轴 + 过滤双轴 ═══

def _cleanup(db, *, doc_ids=(), analysis_pid=None, cog_pid=None, pids=()):
    from app import models
    for d in doc_ids:
        db.query(models.KnowledgeDocument).filter_by(id=d).delete()
    if analysis_pid:
        db.query(models.ProjectAnalysis).filter_by(project_id=analysis_pid).delete()
    if cog_pid:
        db.query(models.ProjectCognition).filter_by(project_id=cog_pid).delete()
    for p in pids:
        db.query(models.Project).filter_by(id=p).delete()
    db.commit()


def test_reflow_analysis_carries_design_type(client):
    """研判回流产出的知识文档带 design_doc_type=方法(design_method 映射)。"""
    from app.database import SessionLocal
    from app import models, safe_json

    pid = client.post("/api/projects", json={"name": "A1回流类型验证"}).json()["id"]
    db = SessionLocal()
    try:
        a = models.ProjectAnalysis(
            project_id=pid, task="difficulty", status="ok",
            content="难点:紧凑用地平衡展示区与货值。",
            sources_json=safe_json.dumps_safe([]),
        )
        db.add(a)
        db.commit()
        db.refresh(a)
        aid = a.id
    finally:
        db.close()
    doc_id = None
    try:
        r = client.post(f"/api/reflow/analysis/{aid}").json()
        assert r["status"] == "ok"
        doc_id = r["document_id"]
        doc = client.get(f"/api/knowledge/documents/{doc_id}").json()
        assert doc["type"] == "design_method"          # 旧轴保持
        assert doc["design_doc_type"] == "方法"         # 新轴按已批映射
    finally:
        db = SessionLocal()
        _cleanup(db, doc_ids=[doc_id] if doc_id else [], analysis_pid=pid, pids=[pid])
        db.close()


def test_reflow_minute_carries_design_type(client):
    """纪要对外版回流带 design_doc_type=案例(case_study 映射,旧轴归档位不动)。"""
    from app.database import SessionLocal
    from app import models, safe_json

    pid = client.post("/api/projects", json={"name": "A1纪要类型验证"}).json()["id"]
    db = SessionLocal()
    try:
        m = models.Meeting(project_id=pid, title="对接会", status="created")
        db.add(m)
        db.commit()
        db.refresh(m)
        minute = models.MeetingMinute(
            meeting_id=m.id, gen_status="ok",
            summary_json=safe_json.dumps_safe([{"text": "确认方向"}]),
            demand_external_json=safe_json.dumps_safe([{"text": "甲方要求提升品质"}]),
            demand_internal_json=safe_json.dumps_safe([]),
            decisions_json=safe_json.dumps_safe([{"text": "下周出比选"}]),
            review_status="confirmed",
        )
        db.add(minute)
        db.commit()
        db.refresh(minute)
        mid = minute.id
    finally:
        db.close()
    doc_id = None
    try:
        r = client.post(f"/api/reflow/minute/{mid}").json()
        assert r["status"] == "ok"
        doc_id = r["document_id"]
        doc = client.get(f"/api/knowledge/documents/{doc_id}").json()
        assert doc["type"] == "case_study"
        assert doc["design_doc_type"] == "案例"
    finally:
        db = SessionLocal()
        from app import models as M
        if doc_id:
            db.query(M.KnowledgeDocument).filter_by(id=doc_id).delete()
        db.query(M.MeetingMinute).filter_by(id=mid).delete()
        db.query(M.Meeting).filter_by(project_id=pid).delete()
        db.query(M.Project).filter_by(id=pid).delete()
        db.commit()
        db.close()


def test_precipitate_carries_design_type(client):
    """跨项目沉淀产出带 design_doc_type(spatial_strategy→方法)。"""
    from app.database import SessionLocal
    from app import models, safe_json

    pid = client.post("/api/projects", json={"name": "A1沉淀类型验证"}).json()["id"]
    db = SessionLocal()
    try:
        cog = models.ProjectCognition(
            project_id=pid, module="positioning", module_label="项目定位",
            fields_json=safe_json.dumps_safe([{
                "key": "strategy", "label": "空间策略",
                "value": "退台式布局呼应山景", "status": "confirmed",
            }]),
            status="confirmed", module_status="confirmed", version=1,
        )
        db.add(cog)
        db.commit()
        db.refresh(cog)
        cog_id = cog.id
    finally:
        db.close()
    doc_id = None
    try:
        r = client.post("/api/cross-project/precipitate",
                        json={"project_id": pid, "cog_id": cog_id, "cross_type": "spatial_strategy"}).json()
        assert r["status"] == "ok"
        doc_id = r["item"]["document_id"]
        doc = client.get(f"/api/knowledge/documents/{doc_id}").json()
        assert doc["type"] == "spatial_strategy"
        assert doc["design_doc_type"] == "方法"
    finally:
        db = SessionLocal()
        _cleanup(db, doc_ids=[doc_id] if doc_id else [], cog_pid=pid, pids=[pid])
        db.close()


def test_search_filter_dual_axis(client):
    """A2 过滤双轴:传旧七类值照常命中(零破坏);传新16类值按语义轴命中。"""
    p = client.post("/api/projects", json={"name": "A2过滤验证"}).json()
    f = client.post(
        f"/api/projects/{p['id']}/files",
        files={"file": ("襄阳技术规定节选A2.txt", "第一条 本规定适用。第二条 本规范。退界要求。".encode("utf-8"), "text/plain")},
    ).json()
    r = client.post(f"/api/projects/{p['id']}/files/{f['id']}/index")
    did = r.json()["document_id"]
    doc = client.get(f"/api/knowledge/documents/{did}").json()
    assert doc["design_doc_type"] == "规范" and doc["type"] == "其他"  # 旧七类无'规范'→其他
    # 新轴值过滤:命中
    s_new = client.post("/api/knowledge/search",
                        json={"query": "技术规定 退界", "top_k": 10, "doc_type": "规范"}).json()
    assert any(h["document_id"] == did for h in s_new["hits"])
    # 旧轴值过滤:该文档旧轴=其他,'规范'旧值不存在于七类——用旧值'其他'照常命中(旧行为)
    s_old = client.post("/api/knowledge/search",
                        json={"query": "技术规定 退界", "top_k": 10, "doc_type": "其他"}).json()
    assert any(h["document_id"] == did for h in s_old["hits"])
    # 不相干值:不命中
    s_none = client.post("/api/knowledge/search",
                         json={"query": "技术规定 退界", "top_k": 10, "doc_type": "效果图"}).json()
    assert not any(h["document_id"] == did for h in s_none["hits"])

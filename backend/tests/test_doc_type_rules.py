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

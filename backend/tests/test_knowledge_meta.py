"""知识元数据 type 规则推断测试（纯函数，无 DB）。"""
from app.knowledge_meta import VALID_TYPES, infer_type


def test_infer_type_drawing_by_ext():
    assert infer_type("效果图.png", "png") == "图纸"
    assert infer_type("总平面图.dwg", "dwg") == "图纸"


def test_infer_type_drawing_by_name():
    assert infer_type("立面控制线.pdf", "pdf") == "图纸"


def test_infer_type_brief():
    assert infer_type("设计任务书.docx", "docx") == "任务书"
    assert infer_type("招标文件.pdf", "pdf") == "任务书"


def test_infer_type_meeting_by_name():
    assert infer_type("项目评审会纪要.txt", "txt") == "会议纪要"


def test_infer_type_meeting_by_body():
    assert infer_type("20260618.md", "md", "", "参会人员：严硕、韩暄；会议时间…") == "会议纪要"


def test_infer_type_case():
    assert infer_type("杭州天奕类比.md", "md", "案例,类比") == "案例"


def test_infer_type_method():
    assert infer_type("抬板方法论.md", "md", "方法,模板") == "方法"
    assert infer_type("设计导则.pdf", "pdf") == "方法"


def test_infer_type_plan():
    assert infer_type("方案设计说明.docx", "docx") == "方案文本"


def test_infer_type_other_default():
    assert infer_type("随手记.txt", "txt") == "其他"


def test_infer_type_priority_image_over_meeting():
    # 既是图片(.png)又含"会议" → 图纸优先（图片资产优先判图纸）
    assert infer_type("会议白板照片.png", "png", "会议") == "图纸"


def test_infer_type_returns_valid_enum():
    for args in [("a.png", "png"), ("任务书.doc", "doc"), ("x.txt", "txt")]:
        assert infer_type(*args) in VALID_TYPES

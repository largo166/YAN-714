"""P1-1 资料类型 v2 · 双轴分类规则表(2026-07-08 已批,规则表直写)。

两轴分离(设计原则,已落方案§5):
- file_format  = 文件格式轴(pdf/ppt/word/excel/image/dwg/rvt/skp/zip/txt/html/unknown)——扩展名映射,确定性。
- design_doc_type = 建筑语义轴(16 类)——文件名/目录名/内容关键词规则打分,带置信度。

为什么分两轴:PDF 可能是规范也可能是汇报;JPG 可能是效果图也可能是总图截图;
PPTX 可能是投标汇报也可能是内部研究——一个 doc_type 装不下"是什么格式"和"讲什么内容"两件事。

纯数据+纯函数:零 IO 零 DB 零 LLM,全部可单测。不改现有 knowledge_meta.infer_type/VALID_TYPES
(旧七类历史结果零破坏,双轨读);兼容映射见 LEGACY_TYPE_MAP。
置信度纪律:强关键词=high / 弱信号(仅扩展名或单一泛词)=low;low 兜底「其他」——
宁可未归类不许错归类(已落档原则)。不引入 AI 分类。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePath

# ═══ 轴1:文件格式 file_format(扩展名映射,确定性,无置信度概念) ═══

FILE_FORMATS = (
    "pdf", "ppt", "word", "excel", "image", "dwg", "rvt", "skp", "zip", "txt", "html", "unknown",
)

_EXT_FORMAT: dict[str, str] = {
    ".pdf": "pdf",
    ".ppt": "ppt", ".pptx": "ppt",
    ".doc": "word", ".docx": "word",
    ".xls": "excel", ".xlsx": "excel", ".csv": "excel",
    ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image", ".gif": "image", ".bmp": "image",
    ".dwg": "dwg", ".dxf": "dwg",
    ".rvt": "rvt", ".rfa": "rvt",
    ".skp": "skp",
    ".zip": "zip", ".rar": "zip", ".7z": "zip",
    ".txt": "txt", ".md": "txt",
    ".html": "html", ".htm": "html",
}


def file_format_of(filename: str) -> str:
    """扩展名 → 文件格式轴。未知扩展名如实 unknown(不猜)。"""
    return _EXT_FORMAT.get(PurePath(filename or "").suffix.lower(), "unknown")


# ═══ 轴2:建筑语义 design_doc_type(16 类,规则打分) ═══

DESIGN_DOC_TYPES = (
    "文本", "演示", "表格", "效果图", "图纸", "模型", "会议", "汇报",
    "案例", "方法", "规范", "合同", "成本", "甲方资料", "现场资料", "其他",
)

# 旧七类(knowledge_meta.VALID_TYPES) → 新16类 默认映射(双轨兼容,写死)
LEGACY_TYPE_MAP: dict[str, str] = {
    "任务书": "甲方资料",
    "会议纪要": "会议",
    "方案文本": "文本",
    "图纸": "图纸",
    "案例": "案例",
    "方法": "方法",
    "其他": "其他",
}

# ── 规则表:每类一组信号词。strong 命中即高置信;weak 需与格式轴佐证或多词共现。 ──
# 词表来源:三层命名规范/知识库现状/建筑设计事务所日常语料(投标/报规/展示区/甲方会)。
@dataclass(frozen=True)
class TypeRule:
    dtype: str
    strong: tuple[str, ...]          # 文件名/目录名强关键词(命中即判,高置信)
    weak: tuple[str, ...] = ()       # 弱关键词(需佐证)
    formats: tuple[str, ...] = ()    # 倾向格式(格式轴佐证;空=不限)
    content: tuple[str, ...] = ()    # 内容首段关键词(补充信号)


RULES: tuple[TypeRule, ...] = (
    # 顺序即优先级:具体类在前,泛类在后(如 效果图 先于 图纸,汇报 先于 演示/文本)
    TypeRule("效果图", strong=("效果图", "鸟瞰", "夜景", "人视", "透视图", "日景", "沿街透视", "半鸟瞰"),
             weak=("渲染", "表现"), formats=("image", "pdf")),
    TypeRule("现场资料", strong=("现场照片", "踏勘", "现场勘", "航拍", "无人机", "现状照片", "工地照片"),
             weak=("现场", "现状"), formats=("image", "zip")),
    TypeRule("规范", strong=("规范", "技术规定", "管理规定", "导则", "标准", "规程", "条例", "细则", "通知", "国标", "GB5"),
             content=("第一条", "第二条", "本规定", "本规范", "适用范围")),
    TypeRule("合同", strong=("合同", "协议", "委托书", "中标通知", "招标文件", "补充协议"),
             content=("甲方", "乙方", "签订", "违约责任")),
    TypeRule("成本", strong=("成本", "造价", "概算", "预算", "限额", "经济指标对比", "货值"),
             weak=("测算",), formats=("excel", "pdf")),
    TypeRule("会议", strong=("会议纪要", "纪要", "会议记录", "座谈", "评审会", "沟通会", "例会"),
             content=("参会", "与会", "会议时间", "会议地点")),
    TypeRule("汇报", strong=("汇报", "述标", "宣讲", "汇报文本", "汇报文件", "评审文本"),
             weak=("成果",), formats=("ppt", "pdf")),
    TypeRule("甲方资料", strong=("任务书", "设计任务", "招标要求", "需求书", "设计要点", "甲方", "业主",
                              "规划条件", "出让条件", "红线图", "用地条件"),
             content=("设计要求", "建设单位", "委托方")),
    TypeRule("图纸", strong=("总图", "总平", "平面图", "立面图", "剖面图", "户型", "施工图", "大样",
                           "节点图", "详图", "竖向", "管综", "日照分析"),
             weak=("平面", "立面", "剖面"), formats=("dwg", "pdf", "image")),
    TypeRule("模型", strong=("模型", "白模", "体块"), formats=("skp", "rvt", "zip")),
    TypeRule("案例", strong=("案例", "对标", "竞品", "参考项目", "借鉴"),
             weak=("参考",)),
    TypeRule("方法", strong=("方法", "工作流", "流程", "模板", "指引", "checklist", "清单", "SOP")),
    TypeRule("表格", strong=("台账", "统计表", "明细表", "指标表", "排期", "计划表"),
             formats=("excel",)),
    TypeRule("演示", strong=(), formats=("ppt",)),   # 纯格式兜底:PPT 无更强语义时=演示(低置信)
    TypeRule("文本", strong=("设计说明", "方案说明", "立意", "构思说明", "文本"),
             weak=("说明",), formats=("word", "txt", "pdf")),
)


@dataclass(frozen=True)
class TypeVerdict:
    dtype: str
    confidence: str  # "high" | "low"
    reason: str      # 命中依据(可解释,供 UI/调试)


def infer_design_type(
    filename: str,
    dir_hint: str = "",
    content_head: str = "",
) -> TypeVerdict:
    """建筑语义轴推断。规则打分,不猜:
    - 文件名/目录名命中 strong → high;
    - weak 命中且格式轴佐证(formats 含该文件格式) → high;
    - 仅格式兜底(演示=ppt)或 weak 无佐证 → low;
    - 全无信号 → 其他/low(宁可未归类不错归类)。
    """
    name = (filename or "")
    hint = (dir_hint or "")
    head = (content_head or "")[:400]
    fmt = file_format_of(name)
    text_nd = f"{name} {hint}"  # 名字+目录(名字即元数据)

    for rule in RULES:
        # 1) 强关键词:文件名/目录名
        for kw in rule.strong:
            if kw.lower() in text_nd.lower():
                return TypeVerdict(rule.dtype, "high", f"名称命中「{kw}」")
        # 2) 内容首段强关键词(≥2 个共现才算强——单个易误伤)
        if rule.content:
            hits = [kw for kw in rule.content if kw in head]
            if len(hits) >= 2:
                return TypeVerdict(rule.dtype, "high", f"内容命中「{'」「'.join(hits[:2])}」")

    for rule in RULES:
        # 3) 弱关键词 + 格式佐证 → high;无佐证 → low
        for kw in rule.weak:
            if kw.lower() in text_nd.lower():
                if not rule.formats or fmt in rule.formats:
                    return TypeVerdict(rule.dtype, "high", f"名称命中「{kw}」+格式 {fmt} 佐证")
                return TypeVerdict(rule.dtype, "low", f"名称命中「{kw}」(无格式佐证)")

    # 4) 纯格式兜底(唯一:ppt→演示;其余格式不强判语义)
    if fmt == "ppt":
        return TypeVerdict("演示", "low", "仅格式 ppt 兜底")
    if fmt == "dwg":
        return TypeVerdict("图纸", "low", "仅格式 dwg 兜底")  # dwg 几乎必是图纸,但无名称信号仍标低置信
    if fmt in ("skp", "rvt"):
        return TypeVerdict("模型", "low", f"仅格式 {fmt} 兜底")

    return TypeVerdict("其他", "low", "无命中信号")


def migrate_legacy_type(old_type: str) -> str:
    """旧七类 → 新16类(双轨兼容映射,写死)。未知旧值 → 其他。"""
    return LEGACY_TYPE_MAP.get((old_type or "").strip(), "其他")

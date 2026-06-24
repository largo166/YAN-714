"""知识元数据：type 规则推断（零 LLM，借鉴 OKF 元数据规范）。

纯函数、无 DB 依赖，便于测试。导入时按文件名/扩展名/tags/正文首段规则推断类型，
不调模型、不拖慢批量导入。description 走按需 AI 生成（见 routers/knowledge.py）。
"""
from __future__ import annotations

VALID_TYPES = {"任务书", "会议纪要", "方案文本", "图纸", "案例", "方法", "其他"}

# 类型 -> 命中关键词（按 infer_type 的优先级顺序使用）
_DRAWING = ("图纸", "总图", "总平", "平面", "立面", "户型", "排版", "dwg", "cad", "施工图")
_BRIEF = ("任务书", "设计任务", "招标", "投标", "需求书", "委托")
_MEETING_NAME = ("会议", "纪要", "座谈", "评审会", "沟通会", "minutes")
_MEETING_BODY = ("参会", "与会", "会议时间", "会议地点")
_CASE = ("案例", "类比", "对标", "参考项目", "竞品")
_METHOD = ("方法", "方法论", "模板", "理论", "导则", "规范", "标准", "checklist")
_PLAN = ("方案", "设计说明", "汇报", "文本", "说明书", "概念", "深化")
_IMAGE_EXT = ("png", "jpg", "jpeg")


def infer_type(filename: str, file_type: str = "", tags: str = "", content_head: str = "") -> str:
    """按优先级短路推断知识文档类型。返回 VALID_TYPES 之一（默认「其他」）。

    优先级：图纸 > 任务书 > 会议纪要 > 案例 > 方法 > 方案文本 > 其他。
    图片资产（png/jpg）优先判为图纸。"""
    name = (filename or "").lower()
    ft = (file_type or "").lower().lstrip(".")
    tg = (tags or "").lower()
    body = (content_head or "")
    nt = name + " " + tg  # 文件名 + 标签合并匹配

    if ft in _IMAGE_EXT or any(k in nt for k in _DRAWING):
        return "图纸"
    if any(k in nt for k in _BRIEF):
        return "任务书"
    if any(k in nt for k in _MEETING_NAME) or any(k in body for k in _MEETING_BODY):
        return "会议纪要"
    if any(k in nt for k in _CASE):
        return "案例"
    if any(k in nt for k in _METHOD):
        return "方法"
    if any(k in nt for k in _PLAN):
        return "方案文本"
    return "其他"

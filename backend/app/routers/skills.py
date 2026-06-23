"""共创营地 · 内置技能目录。

运行时独立（规则 9）：技能能力内置于本体，安装后离线可读；此端点只读返回技能目录，
供前端渲染「可调度技能」卡。执行链路 / 成果卡 / 积分扣减为后续步骤，本步不实现，
不自动串跑（规则 9 / 开发顺序「多 Skill 不自动串跑」）。
"""
from fastapi import APIRouter

from .. import schemas

router = APIRouter(prefix="/api/skills", tags=["skills"])

# 对齐 HTML 权威稿 共创营地 6 张技能卡（id/标题/来源/示例提示与效果图一致）。
_SKILLS = [
    {"id": "ppt", "title": "PPT 大纲生成", "icon": "▤", "source": "读知识库 + 项目数据",
     "example": "帮我做一版方案汇报 PPT", "status": "待命"},
    {"id": "img", "title": "AI 生图 · 意向图", "icon": "🖼", "source": "Prompt 模板 → 即梦 / MJ",
     "example": "生成几张退台立面意向图", "status": "待命"},
    {"id": "review", "title": "方案评审", "icon": "◷", "source": "案例策略 + 方法模板比对",
     "example": "对这版方案做评审，再对标一个类比项目", "status": "待命"},
    {"id": "task", "title": "任务安排生成", "icon": "✓", "source": "→ 写回项目中心 下一步",
     "example": "把需求拆成任务安排和下一步", "status": "待命"},
    {"id": "meeting", "title": "会议纪要", "icon": "🔊", "source": "转写 + 甲方诉求转译",
     "example": "把会议录音转成纪要并排好待办", "status": "待命"},
    {"id": "compete", "title": "竞品分析", "icon": "◰", "source": "读知识库类比项目",
     "example": "找一个类比项目做竞品分析", "status": "待命"},
]


@router.get("", response_model=schemas.SkillListOut)
def list_skills() -> schemas.SkillListOut:
    """返回内置技能目录（只读，不触发任何执行）。"""
    return schemas.SkillListOut(items=_SKILLS, total=len(_SKILLS))

"""协作平台 · 智能助手目录（只读，不替换 chat.py）。"""
from fastapi import APIRouter

from .. import schemas

router = APIRouter(prefix="/api/agents", tags=["agents"])

_AGENTS = [
    {
        "id": "image-radar",
        "name": "找图小雷达",
        "role": "参考图检索",
        "duty": "按项目关键词收集意向图与类比线索",
        "output": "参考图清单",
        "status": "ok",
    },
    {
        "id": "material-helper",
        "name": "材料小帮手",
        "role": "材料整理",
        "duty": "归纳项目资料、任务书、会议材料",
        "output": "材料摘要",
        "status": "ok",
    },
    {
        "id": "review-master",
        "name": "审图老法师",
        "role": "方案评审",
        "duty": "对照规则与经验检查方案风险",
        "output": "审图意见",
        "status": "plan",
    },
    {
        "id": "model-runner",
        "name": "翻模小王子",
        "role": "模型辅助",
        "duty": "辅助整理建模条件与翻模任务",
        "output": "建模任务单",
        "status": "plan",
    },
]


@router.get("", response_model=schemas.AgentListOut)
def list_agents() -> schemas.AgentListOut:
    return schemas.AgentListOut(items=_AGENTS)

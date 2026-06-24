"""协作平台 · 智能助手目录 + 单 Agent 执行（不替换 chat.py）。

可用(ok)的 Agent 复用项目材料 RAG + DeepSeek 真执行；规划中(plan)的 Agent 诚实返回
status=plan，不伪造能力（红线）。未配 key→not_configured；无材料→no_material。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, llm, models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/agents", tags=["agents"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "暂无可用材料：本项目无可解析文件且知识库无命中。请先上传资料或补充知识库。"
PLAN_MSG = "该智能助手仍在规划中，执行能力尚未接入，敬请期待。"

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
_BY_ID = {a["id"]: a for a in _AGENTS}

# 可用 Agent 的执行 prompt（id -> 成果标题 + 指令）
_AGENT_PROMPTS = {
    "image-radar": (
        "参考图检索线索",
        "请基于项目材料，为方案意向图/参考图检索给出关键词与方向清单："
        "应找哪些类型的参考图、建议检索关键词（中英）、可对标的案例线索。",
    ),
    "material-helper": (
        "项目材料摘要",
        "请把项目资料、任务书、会议材料归纳成结构化摘要："
        "项目概况、关键约束、甲方要求、已知信息缺口。",
    ),
}


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("", response_model=schemas.AgentListOut)
def list_agents() -> schemas.AgentListOut:
    return schemas.AgentListOut(items=_AGENTS)


@router.post("/{agent_id}/run", response_model=schemas.AgentRunOut)
def run_agent(
    agent_id: str, payload: schemas.AgentRunIn, db: Session = Depends(get_db)
) -> schemas.AgentRunOut:
    """执行单个智能助手。可用 Agent 走项目 RAG+LLM；规划中 Agent 诚实返回 plan。"""
    agent = _BY_ID.get(agent_id)
    if agent is None:
        raise HTTPException(404, f"未知智能助手：{agent_id}")
    project = db.get(models.Project, payload.project_id)
    if project is None:
        raise HTTPException(404, "项目不存在")

    name = agent["name"]
    # 规划中：不伪造执行能力
    if agent["status"] != "ok" or agent_id not in _AGENT_PROMPTS:
        return schemas.AgentRunOut(agent_id=agent_id, status="plan", title=name, content=PLAN_MSG)

    title, instruction = _AGENT_PROMPTS[agent_id]
    cfg = _settings(db)
    if not cfg.deepseek_api_key:
        return schemas.AgentRunOut(
            agent_id=agent_id, status="not_configured", title=title, content=NOT_CONFIGURED_MSG
        )

    query = f"{project.name} {title} {payload.input}".strip()
    material = analysis.gather_material(db, payload.project_id, query=query, top_k=5)
    sources = [schemas.SkillSourceOut(**s) for s in analysis.sources_as_dicts(material.sources)]
    if material.empty:
        return schemas.AgentRunOut(
            agent_id=agent_id, status="no_material", title=title, content=NO_MATERIAL_MSG
        )

    msgs = [{"role": "system", "content": material.context}] if material.context else []
    user = f"项目：{project.name}\n\n智能助手：{name}\n指令：{instruction}"
    if payload.input.strip():
        user += f"\n\n用户补充：{payload.input.strip()}"
    user += "\n\n要求：仅基于上述材料，条理清晰；材料不足请指出，不要臆测。"
    msgs.append({"role": "user", "content": user})

    try:
        answer = llm.chat_completion(
            msgs, api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url,
            model=cfg.deepseek_model,
        )
        return schemas.AgentRunOut(
            agent_id=agent_id, status="ok", title=title, content=answer,
            sources=sources, model=cfg.deepseek_model,
        )
    except llm.NotConfigured:
        return schemas.AgentRunOut(
            agent_id=agent_id, status="not_configured", title=title, content=NOT_CONFIGURED_MSG
        )
    except llm.LLMError as e:
        return schemas.AgentRunOut(
            agent_id=agent_id, status="error", title=title,
            content="AI 调用失败，请稍后重试或检查设置。", model=cfg.deepseek_model,
            error_message=str(e),
        )

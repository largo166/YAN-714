"""AI 对话 API（Phase 4B）。

key 未配置 → assistant 消息 status=not_configured（不伪造回复）。
key 已配置 → 调用 DeepSeek；失败 → status=error。
use_knowledge=true → 先检索知识库，把片段作为 system 上下文。
project_id 给定 → 注入该项目【已确认】结构化认知（上下文供给协议，规格 1.5）：
  让用户在共创营地直接对话时也能基于已审定认知，而不只是技能/Agent 运行按钮。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, llm, models, retrieval, schemas
from ..database import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.post("/sessions", response_model=schemas.ChatSessionOut, status_code=201)
def create_session(payload: schemas.ChatSessionCreate, db: Session = Depends(get_db)):
    s = models.ChatSession(title=payload.title or "新会话")
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/sessions", response_model=schemas.ChatSessionListOut)
def list_sessions(db: Session = Depends(get_db)):
    items = db.query(models.ChatSession).order_by(models.ChatSession.updated_at.desc()).all()
    return schemas.ChatSessionListOut(items=items, total=len(items))


@router.get("/sessions/{session_id}", response_model=schemas.ChatSessionDetailOut)
def get_session(session_id: int, db: Session = Depends(get_db)):
    s = db.get(models.ChatSession, session_id)
    if s is None:
        raise HTTPException(404, "会话不存在")
    return s


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int, db: Session = Depends(get_db)):
    s = db.get(models.ChatSession, session_id)
    if s is None:
        raise HTTPException(404, "会话不存在")
    db.delete(s)
    db.commit()
    return None


@router.post("/sessions/{session_id}/messages", response_model=schemas.SendMessageOut)
def send_message(session_id: int, payload: schemas.SendMessageIn, db: Session = Depends(get_db)):
    session = db.get(models.ChatSession, session_id)
    if session is None:
        raise HTTPException(404, "会话不存在")

    cfg = _settings(db)
    configured = bool(cfg.deepseek_api_key)

    # 1) 保存 user 消息
    user_msg = models.ChatMessage(session_id=session_id, role="user", content=payload.message, status="ok")
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # 2) 可选知识库检索
    hits = []
    if payload.use_knowledge:
        q = payload.knowledge_query or payload.message
        hits = retrieval.search(db, q, top_k=payload.top_k, project_id=payload.project_id)

    # 2.5) 上下文供给协议：给定 project_id 时注入该项目【已确认】结构化认知（规格 1.5）
    cog_prompt, _cog_sources = ("", [])
    if payload.project_id is not None:
        cog_prompt, _cog_sources = analysis.cognition_system_prompt(db, payload.project_id)
    cognition_injected = False

    # 3) 生成 assistant 消息
    if not configured:
        assistant = models.ChatMessage(
            session_id=session_id,
            role="assistant",
            content=NOT_CONFIGURED_MSG,
            status="not_configured",
        )
    else:
        chat_messages = []
        # 已确认认知置于最前（优先于知识库片段），让对话基于已审定项目认知
        if cog_prompt:
            chat_messages.append({"role": "system", "content": cog_prompt})
            cognition_injected = True
        ctx = llm.build_context_prompt([h.__dict__ for h in hits]) if hits else None
        if ctx:
            chat_messages.append({"role": "system", "content": ctx})
        # 历史（不含刚存的 user，下面单独加），最多带最近 20 条
        history = (
            db.query(models.ChatMessage)
            .filter(models.ChatMessage.session_id == session_id, models.ChatMessage.id < user_msg.id)
            .order_by(models.ChatMessage.id.desc())
            .limit(20)
            .all()
        )
        for m in reversed(history):
            if m.role in ("user", "assistant") and m.status == "ok":
                chat_messages.append({"role": m.role, "content": m.content})
        chat_messages.append({"role": "user", "content": payload.message})

        try:
            answer = llm.chat_completion(
                chat_messages,
                api_key=cfg.deepseek_api_key,
                base_url=cfg.deepseek_base_url,
                model=cfg.deepseek_model,
            )
            assistant = models.ChatMessage(
                session_id=session_id, role="assistant", content=answer, status="ok"
            )
        except llm.NotConfigured:
            assistant = models.ChatMessage(
                session_id=session_id, role="assistant", content=NOT_CONFIGURED_MSG, status="not_configured"
            )
        except llm.LLMError as e:
            assistant = models.ChatMessage(
                session_id=session_id,
                role="assistant",
                content="AI 调用失败，请稍后重试或检查设置。",
                status="error",
                error_message=str(e),
            )

    db.add(assistant)
    # 触发 session.updated_at
    session.title = session.title
    db.commit()
    db.refresh(assistant)

    return schemas.SendMessageOut(
        user_message=user_msg,
        assistant_message=assistant,
        knowledge_hits=[schemas.KnowledgeHitOut(**h.__dict__) for h in hits],
        model=cfg.deepseek_model,
        ai_configured=configured,
        cognition_injected=cognition_injected,
    )

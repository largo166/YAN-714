"""知识库文档 API（Phase 4B）。"""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import knowledge_meta, llm, models, retrieval, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "文档无正文，无法生成摘要（不伪造）。"


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _text_chunks(content: str) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n|\n", content or "") if part.strip()]


@router.get("/documents", response_model=schemas.KnowledgeDocListOut)
def list_documents(db: Session = Depends(get_db)):
    # 排除跨项目库条目(file_type=cross_project)——它们由 /api/cross-project 独立管理,不混入常规库列表
    items = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.file_type != "cross_project")
        .order_by(models.KnowledgeDocument.updated_at.desc())
        .all()
    )
    return schemas.KnowledgeDocListOut(items=items, total=len(items))


@router.get("/stats", response_model=schemas.KnowledgeStatsOut)
def knowledge_stats(db: Session = Depends(get_db)) -> schemas.KnowledgeStatsOut:
    # 同 list_documents：常规库统计不含跨项目库沉淀条目
    docs = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.file_type != "cross_project")
        .all()
    )
    engine = "fts5" if retrieval.fts5_available(db) else "like"
    indexed = len(docs)
    if engine == "fts5":
        retrieval.ensure_fts(db)
        try:
            indexed = int(
                db.execute(text("SELECT COUNT(*) FROM knowledge_documents_fts")).scalar() or 0
            )
        except Exception:
            db.rollback()
            indexed = len(docs)

    chunks = 0
    cjk_chunks = 0
    for doc in docs:
        for chunk in _text_chunks(doc.content_text):
            chunks += 1
            if re.search(r"[\u4e00-\u9fff]", chunk):
                cjk_chunks += 1
    return schemas.KnowledgeStatsOut(
        documents=len(docs),
        indexed=indexed,
        chunks=chunks,
        cjk_chunks=cjk_chunks,
        engine=engine,
    )


@router.post("/documents", response_model=schemas.KnowledgeDocOut, status_code=201)
def create_document(payload: schemas.KnowledgeDocCreate, db: Session = Depends(get_db)):
    doc = models.KnowledgeDocument(**payload.model_dump())
    if not doc.type:  # 手动录入未指定时规则推断类型（零 LLM）
        doc.type = knowledge_meta.infer_type(doc.title, doc.file_type, doc.tags, doc.content_text[:200])
    db.add(doc)
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, retrieval.fts_tags(doc))
    return doc


@router.get("/documents/{document_id}", response_model=schemas.KnowledgeDocOut)
def get_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(models.KnowledgeDocument, document_id)
    if doc is None:
        raise HTTPException(404, "文档不存在")
    return doc


@router.post("/documents/{document_id}/generate-metadata", response_model=schemas.GenerateMetadataOut)
def generate_metadata(document_id: int, db: Session = Depends(get_db)) -> schemas.GenerateMetadataOut:
    """AI 按需生成 description + refine type（围绕文档正文，不伪造）。
    无 key→not_configured 不写库；无正文→no_material；LLM 失败→error 不写库。"""
    doc = db.get(models.KnowledgeDocument, document_id)
    if doc is None:
        raise HTTPException(404, "文档不存在")

    cfg = _settings(db)
    if not cfg.deepseek_api_key:
        return schemas.GenerateMetadataOut(
            status="not_configured", document_id=document_id, message=NOT_CONFIGURED_MSG
        )
    if not doc.content_text.strip():
        return schemas.GenerateMetadataOut(
            status="no_material", document_id=document_id, message=NO_MATERIAL_MSG
        )

    msgs = [
        {
            "role": "system",
            "content": "你是知识库元数据助手。只基于给定正文，生成一句话中文摘要(30-60字，不编造)，"
            "并从给定枚举里选最贴切的类型。严格只输出 JSON。",
        },
        {
            "role": "user",
            "content": (
                f"标题：{doc.title}\n类型枚举：{sorted(knowledge_meta.VALID_TYPES)}\n"
                f"当前类型：{doc.type or '(未定)'}\n正文(节选)：\n{doc.content_text[:2000]}\n\n"
                '只输出 JSON：{"description":"...","type":"..."}'
            ),
        },
    ]
    try:
        answer = llm.chat_completion(
            msgs, api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model
        )
    except llm.NotConfigured:
        return schemas.GenerateMetadataOut(
            status="not_configured", document_id=document_id, message=NOT_CONFIGURED_MSG
        )
    except llm.LLMError as e:
        return schemas.GenerateMetadataOut(
            status="error", document_id=document_id, error_message=str(e),
            message="AI 调用失败，请稍后重试。"
        )

    data = safe_json.loads_or(_strip_fence(answer), {})
    desc = (data.get("description") or "").strip()[:500] if isinstance(data, dict) else ""
    new_type = (data.get("type") or "").strip() if isinstance(data, dict) else ""
    if desc:
        doc.description = desc
    # type refine 仅当返回值在枚举内才更新（防越权写脏枚举）
    if new_type in knowledge_meta.VALID_TYPES:
        doc.type = new_type
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, retrieval.fts_tags(doc))
    return schemas.GenerateMetadataOut(
        status="ok", document_id=document_id, description=doc.description,
        type=doc.type, model=cfg.deepseek_model
    )


def _strip_fence(s: str) -> str:
    """剥 ```json ... ``` 围栏，便于 JSON 解析。"""
    t = (s or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    return t.strip()



@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(models.KnowledgeDocument, document_id)
    if doc is None:
        raise HTTPException(404, "文档不存在")
    db.delete(doc)
    db.commit()
    retrieval.remove_one(db, document_id)
    return None


@router.post("/search", response_model=schemas.KnowledgeSearchOut)
def search_documents(payload: schemas.KnowledgeSearchIn, db: Session = Depends(get_db)):
    hits = retrieval.search(db, payload.query, top_k=payload.top_k, project_id=payload.project_id)
    engine = hits[0].engine if hits else ("fts5" if retrieval.fts5_available(db) else "like")
    return schemas.KnowledgeSearchOut(
        query=payload.query,
        engine=engine,
        hits=[schemas.KnowledgeHitOut(**h.__dict__) for h in hits],
    )


@router.post("/reindex")
def reindex(db: Session = Depends(get_db)):
    count = retrieval.reindex_all(db)
    return {"reindexed": count, "engine": "fts5" if retrieval.fts5_available(db) else "like"}

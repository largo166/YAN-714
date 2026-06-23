"""知识库文档 API（Phase 4B）。"""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models, retrieval, schemas
from ..database import get_db

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


def _text_chunks(content: str) -> list[str]:
    return [part.strip() for part in re.split(r"\n\s*\n|\n", content or "") if part.strip()]


@router.get("/documents", response_model=schemas.KnowledgeDocListOut)
def list_documents(db: Session = Depends(get_db)):
    items = (
        db.query(models.KnowledgeDocument)
        .order_by(models.KnowledgeDocument.updated_at.desc())
        .all()
    )
    return schemas.KnowledgeDocListOut(items=items, total=len(items))


@router.get("/stats", response_model=schemas.KnowledgeStatsOut)
def knowledge_stats(db: Session = Depends(get_db)) -> schemas.KnowledgeStatsOut:
    docs = db.query(models.KnowledgeDocument).all()
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
    db.add(doc)
    db.commit()
    db.refresh(doc)
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, doc.tags)
    return doc


@router.get("/documents/{document_id}", response_model=schemas.KnowledgeDocOut)
def get_document(document_id: int, db: Session = Depends(get_db)):
    doc = db.get(models.KnowledgeDocument, document_id)
    if doc is None:
        raise HTTPException(404, "文档不存在")
    return doc


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
    hits = retrieval.search(db, payload.query, top_k=payload.top_k)
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

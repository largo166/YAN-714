"""知识库文档 API（Phase 4B）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, retrieval, schemas
from ..database import get_db

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/documents", response_model=schemas.KnowledgeDocListOut)
def list_documents(db: Session = Depends(get_db)):
    items = (
        db.query(models.KnowledgeDocument)
        .order_by(models.KnowledgeDocument.updated_at.desc())
        .all()
    )
    return schemas.KnowledgeDocListOut(items=items, total=len(items))


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

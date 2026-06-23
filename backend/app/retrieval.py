"""知识库 FTS5 全文检索层（带 LIKE 兜底）。

设计:knowledge_documents 为权威数据表；knowledge_documents_fts 为 FTS5 索引镜像，
存 rowid=文档id + title + content_text + tags。FTS5 不可用时全部退化为 LIKE。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

from sqlalchemy import text
from sqlalchemy.orm import Session

_FTS_CHECKED = False
_FTS_AVAILABLE = False


def fts5_available(db: Session) -> bool:
    global _FTS_CHECKED, _FTS_AVAILABLE
    if _FTS_CHECKED:
        return _FTS_AVAILABLE
    try:
        db.execute(text("CREATE VIRTUAL TABLE IF NOT EXISTS _fts_probe USING fts5(x)"))
        db.execute(text("DROP TABLE IF EXISTS _fts_probe"))
        db.commit()
        _FTS_AVAILABLE = True
    except Exception:
        db.rollback()
        _FTS_AVAILABLE = False
    _FTS_CHECKED = True
    return _FTS_AVAILABLE


def ensure_fts(db: Session) -> None:
    """建 FTS5 表（若可用）。幂等。"""
    if not fts5_available(db):
        return
    # 独立 FTS5 表（不用 external-content，自行维护同步，避免 rebuild 复杂度）
    db.execute(
        text(
            "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_documents_fts "
            "USING fts5(title, content_text, tags)"
        )
    )
    db.commit()


def reindex_all(db: Session) -> int:
    """重建 FTS 索引；返回索引文档数。FTS 不可用时返回文档总数（LIKE 模式无需索引）。"""
    from . import models

    docs = db.query(models.KnowledgeDocument).all()
    if not fts5_available(db):
        return len(docs)
    ensure_fts(db)
    db.execute(text("DELETE FROM knowledge_documents_fts"))
    for d in docs:
        db.execute(
            text(
                "INSERT INTO knowledge_documents_fts(rowid, title, content_text, tags) "
                "VALUES (:id, :t, :c, :g)"
            ),
            {"id": d.id, "t": d.title, "c": d.content_text, "g": d.tags},
        )
    db.commit()
    return len(docs)


def index_one(db: Session, doc_id: int, title: str, content: str, tags: str) -> None:
    if not fts5_available(db):
        return
    ensure_fts(db)
    db.execute(text("DELETE FROM knowledge_documents_fts WHERE rowid = :id"), {"id": doc_id})
    db.execute(
        text(
            "INSERT INTO knowledge_documents_fts(rowid, title, content_text, tags) "
            "VALUES (:id, :t, :c, :g)"
        ),
        {"id": doc_id, "t": title, "c": content, "g": tags},
    )
    db.commit()


def remove_one(db: Session, doc_id: int) -> None:
    if not fts5_available(db):
        return
    try:
        db.execute(text("DELETE FROM knowledge_documents_fts WHERE rowid = :id"), {"id": doc_id})
        db.commit()
    except Exception:
        db.rollback()


@dataclass
class SearchHit:
    document_id: int
    title: str
    snippet: str
    score: float
    matched_text: str
    engine: str


def _snippet(content: str, q: str, width: int = 120) -> str:
    low = content.lower()
    pos = low.find(q.lower())
    if pos < 0:
        return content[:width].strip()
    start = max(0, pos - width // 3)
    end = min(len(content), pos + width)
    pre = "…" if start > 0 else ""
    suf = "…" if end < len(content) else ""
    return pre + content[start:end].strip() + suf


def search(db: Session, query: str, top_k: int = 5) -> List[SearchHit]:
    from . import models

    q = (query or "").strip()
    if not q:
        return []

    # FTS5 路径
    if fts5_available(db):
        ensure_fts(db)
        try:
            # 简单转义:用双引号包裹做短语匹配，避免特殊符号当语法
            safe = '"' + q.replace('"', '""') + '"'
            rows = db.execute(
                text(
                    "SELECT rowid, bm25(knowledge_documents_fts) AS rank "
                    "FROM knowledge_documents_fts WHERE knowledge_documents_fts MATCH :q "
                    "ORDER BY rank LIMIT :k"
                ),
                {"q": safe, "k": top_k},
            ).fetchall()
            hits: List[SearchHit] = []
            for rid, rank in rows:
                doc = db.get(models.KnowledgeDocument, rid)
                if not doc:
                    continue
                hits.append(
                    SearchHit(
                        document_id=doc.id,
                        title=doc.title,
                        snippet=_snippet(doc.content_text, q),
                        score=round(float(-rank), 4),  # bm25 越小越相关，取负使越大越相关
                        matched_text=q,
                        engine="fts5",
                    )
                )
            if hits:
                return hits
        except Exception:
            db.rollback()  # 落到 LIKE 兜底

    # LIKE 兜底
    like = f"%{q}%"
    docs = (
        db.query(models.KnowledgeDocument)
        .filter(
            (models.KnowledgeDocument.title.ilike(like))
            | (models.KnowledgeDocument.content_text.ilike(like))
            | (models.KnowledgeDocument.tags.ilike(like))
        )
        .limit(top_k)
        .all()
    )
    return [
        SearchHit(
            document_id=d.id,
            title=d.title,
            snippet=_snippet(d.content_text, q),
            score=1.0,
            matched_text=q,
            engine="like",
        )
        for d in docs
    ]

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


def _project_doc_ids(db: Session, project_id: int) -> set[int]:
    """项目级检索范围：该项目所有已索引文件指向的知识文档 id 集合。
    复用 ProjectFile.project_id + indexed_doc_id（>0 表示已回流入库）。"""
    from . import models

    rows = (
        db.query(models.ProjectFile.indexed_doc_id)
        .filter(
            models.ProjectFile.project_id == project_id,
            models.ProjectFile.status == "active",
            models.ProjectFile.indexed_doc_id > 0,
        )
        .all()
    )
    return {r[0] for r in rows}


def search(
    db: Session, query: str, top_k: int = 5, project_id: int | None = None
) -> List[SearchHit]:
    from . import models

    q = (query or "").strip()
    if not q:
        return []

    # 项目级范围：限定到该项目已索引文档；项目无任何已索引文档 → 空结果（不报错）
    scope: set[int] | None = None
    if project_id is not None:
        scope = _project_doc_ids(db, project_id)
        if not scope:
            return []

    # FTS5 路径
    if fts5_available(db):
        ensure_fts(db)
        try:
            # 简单转义:用双引号包裹做短语匹配，避免特殊符号当语法
            safe = '"' + q.replace('"', '""') + '"'
            # 项目级时多取一些再按 scope 过滤，避免被 LIMIT 截掉范围内命中
            fetch_k = top_k if scope is None else max(top_k * 5, top_k)
            rows = db.execute(
                text(
                    "SELECT rowid, bm25(knowledge_documents_fts) AS rank "
                    "FROM knowledge_documents_fts WHERE knowledge_documents_fts MATCH :q "
                    "ORDER BY rank LIMIT :k"
                ),
                {"q": safe, "k": fetch_k},
            ).fetchall()
            hits: List[SearchHit] = []
            for rid, rank in rows:
                if scope is not None and rid not in scope:
                    continue
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
                if len(hits) >= top_k:
                    break
            if hits:
                return hits
        except Exception:
            db.rollback()  # 落到 LIKE 兜底

    # LIKE 兜底
    like = f"%{q}%"
    qy = db.query(models.KnowledgeDocument).filter(
        (models.KnowledgeDocument.title.ilike(like))
        | (models.KnowledgeDocument.content_text.ilike(like))
        | (models.KnowledgeDocument.tags.ilike(like))
    )
    if scope is not None:
        qy = qy.filter(models.KnowledgeDocument.id.in_(scope))
    docs = qy.limit(top_k).all()
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

"""知识库 FTS5 全文检索层（带 LIKE 兜底）。

设计:knowledge_documents 为权威数据表；knowledge_documents_fts 为 FTS5 索引镜像，
存 rowid=文档id + title + content_text + tags。FTS5 不可用时全部退化为 LIKE。
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List

from sqlalchemy import text
from sqlalchemy.orm import Session

_FTS_CHECKED = False
_FTS_AVAILABLE = False

# 中文停用词/虚词 + 常见疑问/语气词：分词时剔除，避免噪声词拉低相关性或撑爆 OR 子句
_STOPWORDS = {
    "的", "了", "是", "和", "与", "及", "在", "对", "把", "被", "给", "为", "之",
    "有", "无", "这", "那", "什么", "怎么", "如何", "哪些", "哪个", "请", "帮",
    "我", "你", "他", "她", "它", "们", "吗", "呢", "吧", "啊", "要", "想",
    "一个", "一些", "关于", "以及", "或者", "还是", "可以", "需要",
    "the", "a", "an", "of", "to", "is", "are", "and", "or", "for", "in", "on",
    "what", "how", "which", "please", "help",
}


def _terms(query: str, *, max_terms: int = 12) -> List[str]:
    """把自然语言 query 切成检索词：
    - 连续 ASCII 字母数字串作为一个词（英文/编号）
    - 连续 CJK 串切成 2 字滑窗 bigram（贴合 FTS 无中文分词器 + LIKE 子串的现实）
    - 剔除停用词/单字虚词，去重，限量
    """
    q = (query or "").strip()
    if not q:
        return []
    terms: List[str] = []
    seen: set[str] = set()

    def _add(t: str) -> None:
        t = t.strip()
        if not t or t in seen or t in _STOPWORDS:
            return
        seen.add(t)
        terms.append(t)

    # 按 ASCII 词 / CJK 串 交替提取
    for chunk in re.findall(r"[A-Za-z0-9]+|[一-鿿]+", q):
        if re.match(r"[A-Za-z0-9]+", chunk):
            if len(chunk) >= 2 or chunk.isdigit():
                _add(chunk.lower())
        else:
            # CJK：长度<=2 整体作为词；否则 2 字 bigram 滑窗
            if len(chunk) <= 2:
                _add(chunk)
            else:
                for i in range(len(chunk) - 1):
                    _add(chunk[i : i + 2])
    return terms[:max_terms]


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


def fts_tags(doc) -> str:
    """把 tags + type + description 拼进 FTS 的 tags 列（软增强：类型名/摘要词可被检索命中）。
    不改 FTS 表结构，零重建成本。"""
    return " ".join(filter(None, [doc.tags, doc.type, doc.description]))


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
            {"id": d.id, "t": d.title, "c": d.content_text, "g": fts_tags(d)},
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


def _snippet(content: str, terms, width: int = 120) -> str:
    """围绕首个命中词截取片段。terms 可为单个词(str)或词列表(取首个在正文出现的)。"""
    if isinstance(terms, str):
        terms = [terms]
    low = content.lower()
    pos = -1
    for t in terms:
        p = low.find(t.lower())
        if p >= 0:
            pos = p
            break
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

    # 分词：把长自然语言 query 切成检索词（修复整句短语匹配 0 命中）
    terms = _terms(q)
    if not terms:
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
            # 每个词做短语转义后 OR 连接（任一命中即返回；不再要求整句完全匹配）
            match_expr = " OR ".join('"' + t.replace('"', '""') + '"' for t in terms)
            # 项目级时多取一些再按 scope 过滤，避免被 LIMIT 截掉范围内命中
            fetch_k = top_k if scope is None else max(top_k * 5, top_k)
            rows = db.execute(
                text(
                    "SELECT rowid, bm25(knowledge_documents_fts) AS rank "
                    "FROM knowledge_documents_fts WHERE knowledge_documents_fts MATCH :q "
                    "ORDER BY rank LIMIT :k"
                ),
                {"q": match_expr, "k": fetch_k},
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
                        snippet=_snippet(doc.content_text, terms),
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

    # LIKE 兜底：任一检索词命中标题/正文/标签即算命中（OR），不再要求整句子串
    from sqlalchemy import or_

    conds = []
    for t in terms:
        like = f"%{t}%"
        conds.append(models.KnowledgeDocument.title.ilike(like))
        conds.append(models.KnowledgeDocument.content_text.ilike(like))
        conds.append(models.KnowledgeDocument.tags.ilike(like))
    qy = db.query(models.KnowledgeDocument).filter(or_(*conds))
    if scope is not None:
        qy = qy.filter(models.KnowledgeDocument.id.in_(scope))
    docs = qy.limit(top_k).all()
    return [
        SearchHit(
            document_id=d.id,
            title=d.title,
            snippet=_snippet(d.content_text, terms),
            score=1.0,
            matched_text=q,
            engine="like",
        )
        for d in docs
    ]

"""知识库文档 API（Phase 4B）。"""
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import doc_type_rules, knowledge_meta, llm, models, retrieval, safe_json, schemas, storage_probe
from ..database import get_db

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("/health")
def library_health(db: Session = Depends(get_db)) -> dict:
    """库完整性体检(只读):四态(记录在文件在/文件丢/孤儿/root脱节)。
    汇总计数全量真值;明细默认前 200 带 total。真库清洗前置(数据操作铁律第0条)。
    P0+(已批):+checks 轻量段(现有数据源聚合,不建表)——索引页能力行/最后入库时间用。"""
    result = storage_probe.check_library(db)
    # ── checks:全部来自现有能力探测,零新表零缓存 ──
    from .. import ocr

    cfg = db.get(models.AppSetting, 1)
    repo = (cfg.repository_root_path if cfg else "") or ""
    repo_ok = False
    if repo:
        try:
            repo_ok = Path(repo).is_dir()
        except OSError:
            repo_ok = False
    last_doc = (
        db.query(models.KnowledgeDocument.updated_at)
        .order_by(models.KnowledgeDocument.updated_at.desc())
        .first()
    )
    result["checks"] = {
        "fts": retrieval.fts5_available(db),          # 全文检索引擎可用
        "ocr": ocr.available(),                        # 本地 OCR 就绪
        "repo_path_set": bool(repo),                   # 仓库根已配置
        "repo_path_ok": repo_ok,                       # 仓库根可达(未配置=False,如实)
        "last_indexed_at": last_doc[0].isoformat() if last_doc and last_doc[0] else "",
    }
    return result

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


# 派生知识条目（跨项目沉淀/回流成果）的 file_type——它们各有专属视图(/cross-project、回流面板),
# 不混入数据基地"常规库"列表/统计("常规库"=用户直接上传/创建的原始资料)。
_DERIVED_FILE_TYPES = ("cross_project", "reflow_analysis", "reflow_minute")


@router.get("/documents", response_model=schemas.KnowledgeDocListOut)
def list_documents(db: Session = Depends(get_db)):
    items = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.file_type.notin_(_DERIVED_FILE_TYPES))
        .order_by(models.KnowledgeDocument.updated_at.desc())
        .all()
    )
    return schemas.KnowledgeDocListOut(items=items, total=len(items))


@router.get("/stats", response_model=schemas.KnowledgeStatsOut)
def knowledge_stats(db: Session = Depends(get_db)) -> schemas.KnowledgeStatsOut:
    # 同 list_documents：常规库统计不含派生条目(跨项目沉淀/回流成果)
    docs = (
        db.query(models.KnowledgeDocument)
        .filter(models.KnowledgeDocument.file_type.notin_(_DERIVED_FILE_TYPES))
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
    if not doc.design_doc_type:  # P1-1 双轨:建筑语义轴同步推断
        doc.design_doc_type = doc_type_rules.infer_design_type(doc.title, content_head=doc.content_text[:400]).dtype
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
            "content": "你是知识库元数据助手。只基于给定正文，生成一句话中文摘要(30-60字，直接说这份资料是什么/讲什么，"
            "不写小作文、不用『本文档』『可作为参考』等套话、不编造)，并从给定枚举里选最贴切的类型。严格只输出 JSON。",
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
    # 清掉回流反向引用,避免 reflowed_doc_id 指向已删文档导致幂等失效(对抗复核坐实点)
    db.query(models.ProjectAnalysis).filter(
        models.ProjectAnalysis.reflowed_doc_id == document_id
    ).update({"reflowed_doc_id": 0})
    db.query(models.MeetingMinute).filter(
        models.MeetingMinute.reflowed_doc_id == document_id
    ).update({"reflowed_doc_id": 0})
    db.delete(doc)
    db.commit()
    retrieval.remove_one(db, document_id)
    return None


@router.post("/search", response_model=schemas.KnowledgeSearchOut)
def search_documents(payload: schemas.KnowledgeSearchIn, db: Session = Depends(get_db)):
    hits = retrieval.search(db, payload.query, top_k=payload.top_k, project_id=payload.project_id)
    engine = hits[0].engine if hits else ("fts5" if retrieval.fts5_available(db) else "like")
    out = [schemas.KnowledgeHitOut(**h.__dict__) for h in hits]
    # ── P0 检索第一生产力(2026-07-08):命中层富化+过滤(检索心脏 retrieval.search 零改动) ──
    if out:
        doc_ids = [h.document_id for h in out]
        docs = {d.id: d for d in db.query(models.KnowledgeDocument).filter(models.KnowledgeDocument.id.in_(doc_ids)).all()}
        # 反查项目文件(reveal 用):indexed_doc_id → ProjectFile;一次批量查询
        pfs = {
            pf.indexed_doc_id: pf
            for pf in db.query(models.ProjectFile)
            .filter(models.ProjectFile.indexed_doc_id.in_(doc_ids), models.ProjectFile.status == "active")
            .all()
        }
        pids = {pf.project_id for pf in pfs.values()}
        pnames = {p.id: p.name for p in db.query(models.Project).filter(models.Project.id.in_(pids)).all()} if pids else {}
        for h in out:
            doc = docs.get(h.document_id)
            if doc is not None:
                h.file_type = doc.file_type or ""
                h.doc_type = doc.type or ""
                # P1-1 双轨读:新列有值用新列;存量空值按旧类映射(不改库,读时兜底)
                h.design_doc_type = doc.design_doc_type or doc_type_rules.migrate_legacy_type(doc.type)
                h.updated_at = doc.updated_at.isoformat() if doc.updated_at else ""
            pf = pfs.get(h.document_id)
            if pf is not None:
                h.project_id = pf.project_id
                h.project_file_id = pf.id
                h.project_name = pnames.get(pf.project_id, "")
                # P0+(已批):可定位态+路径——storage_probe 单一口径,禁第二份拼接
                phys = storage_probe.resolve_physical(pf.stored_path, pf.storage_root)
                if phys is None:
                    h.locate_status = "路径异常"
                else:
                    h.folder_hint = "…/" + "/".join(Path(pf.stored_path).parts[:-1][-2:]) + "/" if len(Path(pf.stored_path).parts) > 1 else ""
                    try:
                        if phys.exists():
                            h.locate_status = "可定位"
                            h.abs_path = str(phys)  # 仅可定位时回填(复制路径动作用)
                        else:
                            h.locate_status = "文件缺失"
                    except OSError:
                        h.locate_status = "未知"
        # doc_type 过滤:命中层内存过滤(top_k≤50 零成本),不动 FTS 查询——纯加法,None=不过滤
        if payload.doc_type:
            out = [h for h in out if h.doc_type == payload.doc_type]
    return schemas.KnowledgeSearchOut(query=payload.query, engine=engine, hits=out)


@router.post("/reindex")
def reindex(db: Session = Depends(get_db)):
    count = retrieval.reindex_all(db)
    return {"reindexed": count, "engine": "fts5" if retrieval.fts5_available(db) else "like"}

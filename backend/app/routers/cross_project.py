"""B 类跨项目复用库 API（ProjectCognition Schema 规格 B1-B6，阶段3）。

跨项目库 = 把【已确认】的项目认知沉淀为可被任意项目检索复用的知识条目。
落 KnowledgeDocument（type 字段携带 B1-B6 类别），全局 FTS 可检索（不限项目范围）。

红线（不伪造，纲要规则3/4）：
- 只有 status=confirmed 且有值的认知字段才能沉淀（人工审定后才入库）；无确认内容→empty 不写库。
- 沉淀条目带真实出处（resource=源项目名·模块标签），不凭空造可复用资产。
- 删除/覆盖走知识库既有软删链路，不在此另开高风险写路径。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from typing import Optional

from .. import analysis, models, retrieval, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/cross-project", tags=["cross-project"])


@router.get("/types", response_model=list[schemas.CrossProjectTypeOut])
def list_types(db: Session = Depends(get_db)):
    """B1-B6 类别清单 + 各类已沉淀条目数。"""
    out = []
    for t in schemas.CROSS_PROJECT_TYPES:
        cnt = (
            db.query(models.KnowledgeDocument)
            .filter(models.KnowledgeDocument.type == t)
            .count()
        )
        out.append(schemas.CrossProjectTypeOut(type=t, label=schemas.CROSS_PROJECT_LABELS[t], count=cnt))
    return out


@router.get("/library", response_model=list[schemas.CrossProjectItemOut])
def list_library(cross_type: Optional[str] = None, db: Session = Depends(get_db)):
    """列出跨项目库条目（可按类别过滤）。全局——任意项目都能复用。"""
    valid = set(schemas.CROSS_PROJECT_TYPES)
    q = db.query(models.KnowledgeDocument).filter(models.KnowledgeDocument.type.in_(valid))
    if cross_type:
        if cross_type not in valid:
            raise HTTPException(404, f"未知跨项目库类别：{cross_type}")
        q = q.filter(models.KnowledgeDocument.type == cross_type)
    rows = q.order_by(models.KnowledgeDocument.created_at.desc()).all()
    return [
        schemas.CrossProjectItemOut(
            document_id=d.id, title=d.title, cross_type=d.type,
            label=schemas.CROSS_PROJECT_LABELS.get(d.type, d.type),
            description=d.description, resource=d.resource,
            snippet=(d.content_text or "")[:200],
        )
        for d in rows
    ]


def _confirmed_lines(cog: models.ProjectCognition) -> list[str]:
    """取认知里【已确认】且有值的字段，组装成沉淀正文（draft/empty 不取，不伪造）。
    递归剔除嵌套空壳（[None]/['  ']），list 逐项过滤，绝不把 'None' 字面量沉淀进库。"""
    raw = safe_json.loads_or(cog.fields_json, [])
    fields = raw if isinstance(raw, list) else []
    lines: list[str] = []
    for f in fields:
        if not isinstance(f, dict) or f.get("status") != "confirmed":
            continue
        v = f.get("value")
        if not analysis.is_nonempty(v):   # 递归判定,捕捉嵌套空壳
            continue
        vs = analysis.value_to_text(v)     # list 逐项过滤空壳后渲染
        if not vs.strip():
            continue
        lines.append(f"{f.get('label', f.get('key'))}：{vs}")
    return lines


@router.post("/precipitate", response_model=schemas.PrecipitateOut)
def precipitate(payload: schemas.PrecipitateIn, db: Session = Depends(get_db)) -> schemas.PrecipitateOut:
    """把某项目某认知模块的【已确认】内容沉淀进跨项目库（B1-B6 之一）。"""
    if payload.cross_type not in set(schemas.CROSS_PROJECT_TYPES):
        raise HTTPException(404, f"未知跨项目库类别：{payload.cross_type}")
    project = db.get(models.Project, payload.project_id)
    if project is None:
        raise HTTPException(404, "项目不存在")
    cog = db.get(models.ProjectCognition, payload.cog_id)
    if cog is None or cog.project_id != payload.project_id:
        raise HTTPException(404, "认知记录不存在")

    lines = _confirmed_lines(cog)
    if not lines:
        # 无已确认内容 → 不沉淀（不伪造可复用资产）
        return schemas.PrecipitateOut(
            status="empty",
            message="该认知模块暂无已确认字段，无法沉淀（请先人工审定后再沉淀，不伪造）。",
        )

    module_label = cog.module_label or cog.module
    title = payload.title or f"{project.name}·{module_label}"
    resource = f"源项目：{project.name}；源模块：{module_label}（已确认认知沉淀）"
    body_lines = [f"【{schemas.CROSS_PROJECT_LABELS[payload.cross_type]}·可复用】来自 {project.name} 的 {module_label}："]
    # summary_md 是抽取期(draft)AI 生成、未经逐条审定——仅当整个模块已确认时才纳入,否则不沉淀未审定内容(不伪造)
    include_summary = cog.summary_md and cog.module_status == "confirmed"
    if include_summary:
        body_lines.append(f"摘要：{cog.summary_md}")
    body_lines.extend(f"- {ln}" for ln in lines)
    content = "\n".join(body_lines)

    doc = models.KnowledgeDocument(
        title=title,
        content_text=content,
        file_type="cross_project",
        type=payload.cross_type,
        description=((cog.summary_md if include_summary else lines[0]) or lines[0])[:500],
        resource=resource,
        tags=schemas.CROSS_PROJECT_LABELS[payload.cross_type],
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    # 入 FTS 索引——跨项目库全局可检索复用
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, retrieval.fts_tags(doc))

    return schemas.PrecipitateOut(
        status="ok",
        item=schemas.CrossProjectItemOut(
            document_id=doc.id, title=doc.title, cross_type=doc.type,
            label=schemas.CROSS_PROJECT_LABELS[doc.type],
            description=doc.description, resource=doc.resource,
            snippet=doc.content_text[:200],
        ),
    )

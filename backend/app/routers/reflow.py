"""回流契约 API（成果回写数据基地，阶段5）。

把项目里【人工确认/有效】的成果回写数据基地(KnowledgeDocument)，形成"越用越厚"的闭环。
本期补两条此前缺失的知识回流路径：
- POST /api/reflow/analysis/{analysis_id}  研判结论(ProjectAnalysis, status=ok)→ 知识库
- POST /api/reflow/minute/{minute_id}      会议纪要【对外版】(review_status=confirmed)→ 知识库

红线（不伪造，纲要规则3/4）：
- 只回流【人工确认/真实有效】成果：研判须 status=ok 且有正文；纪要须 review_status=confirmed。
- 回流条目带真实出处(resource=源项目/源成果)；纪要只回流【对外版】(对内研判不外泄,红线)。
- 幂等：研判用 reflowed_doc_id 记已回流文档,重复调用返回 already 不重复写；纪要复用 reflowed 标志。
- 入 FTS 全局可检索；与阶段3 跨项目沉淀互补(那个沉淀认知/策略,这个回流项目成果)。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, models, retrieval, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/reflow", tags=["reflow"])


def _index(db: Session, doc: models.KnowledgeDocument) -> None:
    retrieval.index_one(db, doc.id, doc.title, doc.content_text, retrieval.fts_tags(doc))


@router.post("/analysis/{analysis_id}", response_model=schemas.ReflowResultOut)
def reflow_analysis(analysis_id: int, db: Session = Depends(get_db)) -> schemas.ReflowResultOut:
    """把一次研判结论(ProjectAnalysis)回写数据基地。须 status=ok 且有正文；幂等。"""
    row = db.get(models.ProjectAnalysis, analysis_id)
    if row is None:
        raise HTTPException(404, "研判记录不存在")
    if row.status != "ok" or not (row.content or "").strip():
        return schemas.ReflowResultOut(
            status="not_confirmed",
            message="该研判无有效结论（未成功生成或无正文），不能回流（不伪造）。",
        )
    # 幂等：已回流且目标文档仍在 → 直接返回 already
    if row.reflowed_doc_id:
        existing = db.get(models.KnowledgeDocument, row.reflowed_doc_id)
        if existing is not None:
            return schemas.ReflowResultOut(
                status="already", document_id=existing.id, title=existing.title,
                resource=existing.resource, message="已回流，未重复写入。",
            )

    project = db.get(models.Project, row.project_id)
    pname = project.name if project else f"项目{row.project_id}"
    task_cn = analysis.TASKS.get(row.task, (row.task, ""))[0]
    title = f"{pname}·{task_cn}"
    resource = f"源项目：{pname}；源成果：研判·{task_cn}（已生成结论回流）"
    body = [f"【研判成果·可复用】{pname} 的 {task_cn}：", row.content.strip()]
    # 附原研判的结构化出处（让回流条目也可追溯到底层材料）
    srcs = safe_json.loads_or(row.sources_json, [])
    if isinstance(srcs, list) and srcs:
        body.append("\n出处：")
        for i, s in enumerate(srcs[:8], 1):
            if isinstance(s, dict):
                body.append(f"[{i}] {s.get('title', '')}: {s.get('snippet', '')}")
    content = "\n".join(body)

    doc = models.KnowledgeDocument(
        title=title, content_text=content, file_type="reflow_analysis",
        type="design_method",  # 研判结论归入"设计方法"类知识(可被检索复用)
        description=row.content.strip()[:500], resource=resource, tags=f"研判 {task_cn}",
    )
    # 原子化：doc 与 reflowed_doc_id 反向引用在【同一次 commit】落库,避免崩溃留孤儿文档。
    db.add(doc)
    db.flush()                       # 取得 doc.id,尚未提交
    row.reflowed_doc_id = doc.id
    db.commit()
    db.refresh(doc)
    _index(db, doc)
    return schemas.ReflowResultOut(
        status="ok", document_id=doc.id, title=doc.title, resource=resource,
    )


def _minute_external_text(row: models.MeetingMinute) -> str:
    """组装纪要【对外版】正文：会议要点 + 核心事项 + 对外诉求 + 决议 + 待办。
    绝不含 demand_internal(对内研判)——红线:对内版不外泄。"""
    def _lines(label: str, raw: str) -> list[str]:
        items = safe_json.loads_or(raw, [])
        if not isinstance(items, list) or not items:
            return []
        out = [f"【{label}】"]
        for it in items:
            if isinstance(it, dict):
                # 取常见文本字段
                txt = it.get("text") or it.get("title") or it.get("content") or "; ".join(
                    str(v) for v in it.values() if isinstance(v, str)
                )
            else:
                txt = str(it)
            if txt:
                out.append(f"- {txt}")
        return out if len(out) > 1 else []

    parts: list[str] = []
    parts += _lines("会议纪要要点", row.summary_json)
    parts += _lines("核心事项", row.core_items_json)
    parts += _lines("甲方诉求（对外）", row.demand_external_json)  # 仅对外版
    parts += _lines("决议", row.decisions_json)
    parts += _lines("待办", row.todos_json)
    return "\n".join(parts)


@router.post("/minute/{minute_id}", response_model=schemas.ReflowResultOut)
def reflow_minute_to_kb(minute_id: int, db: Session = Depends(get_db)) -> schemas.ReflowResultOut:
    """把会议纪要【对外版】回写数据基地。须 review_status=confirmed；幂等；对内研判不外泄。"""
    row = db.get(models.MeetingMinute, minute_id)
    if row is None:
        raise HTTPException(404, "纪要不存在")
    if row.review_status != "confirmed":
        return schemas.ReflowResultOut(
            status="not_confirmed", message="纪要未经人工审定（draft），不能回流（不伪造）。",
        )
    # 幂等：用确定的 reflowed_doc_id 链（不靠标题去重，避免同名会议碰撞致静默丢失）
    if row.reflowed_doc_id:
        existing = db.get(models.KnowledgeDocument, row.reflowed_doc_id)
        if existing is not None:
            return schemas.ReflowResultOut(
                status="already", document_id=existing.id, title=existing.title,
                resource=existing.resource, message="已回流，未重复写入。",
            )

    content = _minute_external_text(row)
    if not content.strip():
        return schemas.ReflowResultOut(status="empty", message="纪要对外版无可回流内容。")

    meeting = db.get(models.Meeting, row.meeting_id)
    project = db.get(models.Project, meeting.project_id) if meeting else None
    pname = project.name if project else "未知项目"
    mtitle = (meeting.title if meeting else "") or "会议纪要"
    title = f"{pname}·{mtitle}（纪要对外版·#{row.id}）"
    resource = f"源项目：{pname}；源成果：会议纪要·对外版（已确认回流，纪要#{row.id}）"

    doc = models.KnowledgeDocument(
        title=title, content_text=f"【会议纪要·对外版】{pname}·{mtitle}：\n{content}",
        file_type="reflow_minute", type="case_study",  # 纪要归入案例库
        description=content.strip()[:500], resource=resource, tags=f"会议纪要 {pname}",
    )
    # 原子化：doc 与反向引用同一次 commit
    db.add(doc)
    db.flush()
    row.reflowed = True
    row.reflowed_doc_id = doc.id
    db.commit()
    db.refresh(doc)
    _index(db, doc)
    return schemas.ReflowResultOut(
        status="ok", document_id=doc.id, title=doc.title, resource=resource,
    )

"""AI 研判 API（Phase 4D）：analyze / 列表 / 详情 / 导出 Markdown。

三态不伪造（纲要红线）：
- 未配 key → status=not_configured（不调模型）
- 双零材料 → status=no_material（不调模型、不编造来源）
- LLM 失败 → status=error
结论与结构化出处分离落库（sources_json 用 safe_json 容错读写）。
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from .. import analysis, llm, models, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["project-analysis"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "暂无可用材料：本项目无可解析文件且知识库无命中。请先上传资料或补充知识库后再研判。"


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _project_or_404(db: Session, project_id: int) -> models.Project:
    p = db.get(models.Project, project_id)
    if p is None:
        raise HTTPException(404, "项目不存在")
    return p


def _to_out(row: models.ProjectAnalysis) -> schemas.ProjectAnalysisOut:
    sources = safe_json.loads_or(row.sources_json, [])
    return schemas.ProjectAnalysisOut(
        id=row.id,
        project_id=row.project_id,
        task=row.task,
        status=row.status,
        content=row.content,
        sources=[schemas.AnalysisSourceOut(**s) for s in sources] if isinstance(sources, list) else [],
        model=row.model,
        error_message=row.error_message,
        created_at=row.created_at,
    )


@router.post("/{project_id}/analyze", response_model=schemas.ProjectAnalysisOut)
def analyze(project_id: int, payload: schemas.AnalyzeIn, db: Session = Depends(get_db)):
    project = _project_or_404(db, project_id)
    if payload.task not in analysis.TASKS:
        raise HTTPException(400, f"未知研判任务：{payload.task}")

    cfg = _settings(db)
    configured = bool(cfg.deepseek_api_key)

    task_cn, _ = analysis.TASKS[payload.task]
    material = analysis.gather_material(db, project_id, query=f"{project.name} {task_cn}", top_k=payload.top_k)
    sources_dicts = analysis.sources_as_dicts(material.sources)

    # 三态判断（均不伪造）
    if not configured:
        status, content, model, err = "not_configured", NOT_CONFIGURED_MSG, "", ""
        sources_dicts = []  # 未生成则不挂出处
    elif material.empty:
        status, content, model, err = "no_material", NO_MATERIAL_MSG, "", ""
    else:
        messages = analysis.build_messages(payload.task, project.name, material)
        try:
            answer = llm.chat_completion(
                messages,
                api_key=cfg.deepseek_api_key,
                base_url=cfg.deepseek_base_url,
                model=cfg.deepseek_model,
            )
            status, content, model, err = "ok", answer, cfg.deepseek_model, ""
        except llm.NotConfigured:
            status, content, model, err = "not_configured", NOT_CONFIGURED_MSG, "", ""
            sources_dicts = []
        except llm.LLMError as e:
            status, content, model, err = "error", "AI 调用失败，请稍后重试或检查设置。", cfg.deepseek_model, str(e)

    row = models.ProjectAnalysis(
        project_id=project_id,
        task=payload.task,
        status=status,
        content=content,
        sources_json=safe_json.dumps_safe(sources_dicts),
        model=model,
        error_message=err,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/{project_id}/analyses", response_model=schemas.ProjectAnalysisListOut)
def list_analyses(project_id: int, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    rows = (
        db.query(models.ProjectAnalysis)
        .filter(models.ProjectAnalysis.project_id == project_id)
        .order_by(models.ProjectAnalysis.created_at.desc())
        .all()
    )
    return schemas.ProjectAnalysisListOut(items=[_to_out(r) for r in rows], total=len(rows))


@router.get("/{project_id}/analyses/{analysis_id}", response_model=schemas.ProjectAnalysisOut)
def get_analysis(project_id: int, analysis_id: int, db: Session = Depends(get_db)):
    row = db.get(models.ProjectAnalysis, analysis_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "研判记录不存在")
    return _to_out(row)


@router.get("/{project_id}/analyses/{analysis_id}/export.md", response_class=PlainTextResponse)
def export_markdown(project_id: int, analysis_id: int, db: Session = Depends(get_db)):
    row = db.get(models.ProjectAnalysis, analysis_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "研判记录不存在")
    project = _project_or_404(db, project_id)
    sources = safe_json.loads_or(row.sources_json, [])
    md = analysis.render_markdown(
        row.task, project.name, row.content,
        sources if isinstance(sources, list) else [],
        row.status, created_at=row.created_at.isoformat(),
    )
    return PlainTextResponse(content=md, media_type="text/markdown; charset=utf-8")

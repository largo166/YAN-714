"""项目结构化认知 API（P2 脊椎）。

把项目认知从"散文研判"升级为"受控 schema 槽位"。本期只做任务书(brief)一个 canonical 模块：
- POST /api/projects/{id}/cognition/brief/extract  AI 抽取任务书16字段 → ProjectCognition(draft)
- GET  /api/projects/{id}/cognition                 读该项目所有认知
- POST /api/projects/{id}/cognition/{cog_id}/confirm 人工审定 draft→confirmed(下游才消费)
- PUT  /api/projects/{id}/cognition/{cog_id}         人工编辑字段

红线：无 key→not_configured、无材料→no_material 均不写库不伪造；字段抽不到留空标"待补"，绝不编造。
"""
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, llm, models, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["cognition"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "暂无可用材料：本项目无可解析文件且知识库无命中，无法抽取任务书认知（不伪造）。"


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


def _to_out(row: models.ProjectCognition) -> schemas.ProjectCognitionOut:
    return schemas.ProjectCognitionOut(
        id=row.id,
        project_id=row.project_id,
        module=row.module,
        fields=safe_json.loads_or(row.fields_json, {}),
        summary_md=row.summary_md,
        status=row.status,
        version=row.version,
        sources=[schemas.CognitionSourceOut(**s) for s in safe_json.loads_or(row.sources_json, [])],
        model=row.model,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _strip_fence(s: str) -> str:
    t = (s or "").strip()
    if t.startswith("```"):
        import re
        t = re.sub(r"^```[a-zA-Z]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t)
    return t.strip()


@router.get("/{project_id}/cognition", response_model=list[schemas.ProjectCognitionOut])
def list_cognition(project_id: int, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    rows = (
        db.query(models.ProjectCognition)
        .filter(models.ProjectCognition.project_id == project_id)
        .order_by(models.ProjectCognition.created_at.desc())
        .all()
    )
    return [_to_out(r) for r in rows]


@router.post("/{project_id}/cognition/brief/extract", response_model=schemas.CognitionExtractOut)
def extract_brief(project_id: int, db: Session = Depends(get_db)) -> schemas.CognitionExtractOut:
    """AI 抽取任务书16字段 → ProjectCognition(module=brief, draft)。type-aware 优先取任务书材料。"""
    project = _project_or_404(db, project_id)
    cfg = _settings(db)
    if not cfg.deepseek_api_key:
        return schemas.CognitionExtractOut(status="not_configured", message=NOT_CONFIGURED_MSG)

    material = analysis.gather_material(db, project_id, query=f"{project.name} 任务书 设计任务 项目定位", top_k=5)
    if material.empty:
        return schemas.CognitionExtractOut(status="no_material", message=NO_MATERIAL_MSG)

    fields = list(schemas.BRIEF_FIELDS)
    example_keys = "".join('"%s":"...", ' % f for f in fields[:3])
    sys_prompt = (
        "你是建筑方案前期任务书解读助手。只基于给定材料，抽取任务书结构化字段。"
        "严格只输出 JSON 对象，键为给定字段名；某字段材料里没有就填空字符串，绝不编造。"
        "另给一个 _summary 键，30-60字概括该项目核心。"
    )
    user_prompt = (
        f"项目：{project.name}\n字段清单：{fields}\n\n材料：\n{material.context}\n\n"
        f'只输出 JSON：{{{example_keys}..., "_summary":"..."}}'
    )
    try:
        answer = llm.chat_completion(
            [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user_prompt}],
            api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
        )
    except llm.NotConfigured:
        return schemas.CognitionExtractOut(status="not_configured", message=NOT_CONFIGURED_MSG)
    except llm.LLMError as e:
        return schemas.CognitionExtractOut(status="error", error_message=str(e), message="AI 调用失败，请稍后重试。")

    data = safe_json.loads_or(_strip_fence(answer), {})
    if not isinstance(data, dict):
        data = {}
    summary = str(data.pop("_summary", ""))[:500]
    # 只保留 canonical 字段，未抽到的留空（不伪造）
    parsed = {f: str(data.get(f, "")).strip() for f in fields}

    row = models.ProjectCognition(
        project_id=project_id,
        module="brief",
        fields_json=safe_json.dumps_safe(parsed, default="{}"),
        summary_md=summary,
        status="draft",
        sources_json=safe_json.dumps_safe(analysis.sources_as_dicts(material.sources)),
        model=cfg.deepseek_model,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.CognitionExtractOut(status="ok", cognition=_to_out(row))


@router.post("/{project_id}/cognition/{cog_id}/confirm", response_model=schemas.ProjectCognitionOut)
def confirm_cognition(project_id: int, cog_id: int, db: Session = Depends(get_db)):
    """人工审定 draft→confirmed（下游推演才消费已确认认知）。"""
    _project_or_404(db, project_id)
    row = db.get(models.ProjectCognition, cog_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "认知记录不存在")
    row.status = "confirmed"
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.put("/{project_id}/cognition/{cog_id}", response_model=schemas.ProjectCognitionOut)
def update_cognition(
    project_id: int, cog_id: int, fields: dict = Body(..., embed=True), db: Session = Depends(get_db)
):
    """人工编辑字段（编辑后回到 draft，需重新确认）。"""
    _project_or_404(db, project_id)
    row = db.get(models.ProjectCognition, cog_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "认知记录不存在")
    # 只接受 canonical 字段
    cur = safe_json.loads_or(row.fields_json, {})
    for k, v in (fields or {}).items():
        if k in schemas.BRIEF_FIELDS:
            cur[k] = str(v)
    row.fields_json = safe_json.dumps_safe(cur, default="{}")
    row.status = "draft"
    row.version += 1
    db.commit()
    db.refresh(row)
    return _to_out(row)

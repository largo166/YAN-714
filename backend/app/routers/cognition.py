"""项目结构化认知 API（ProjectCognition Schema 规格 v1.0）。

把项目认知从"散文研判"升级为"受控 schema 槽位 + extractable 四档防假认知"。
本期只完整做任务书(brief)一个 module：
- POST /api/projects/{id}/cognition/brief/extract  AI 按 extractable 分档抽取 → 字段记录数组
- GET  /api/projects/{id}/cognition                 读该项目所有认知
- POST /api/projects/{id}/cognition/{cog_id}/confirm 人工审定（high/medium draft→confirmed）
- PUT  /api/projects/{id}/cognition/{cog_id}         人工编辑单字段 value+status

红线（规格 1.3）：high/medium 抽取带原文出处；low 只给 draft+推理依据、禁 confirmed；
manual_only 不填值、只输出引导问题(status=empty)；无 key→not_configured、无正文→no_material 不写库不伪造。
"""
import re

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, llm, models, safe_json, schemas
from ..database import get_db

router = APIRouter(prefix="/api/projects", tags=["cognition"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "暂无可用正文材料：本项目无可全文解析的文件且知识库无命中，无法抽取任务书认知（不伪造）。"


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


def _module_status(fields: list) -> str:
    """按字段 status 聚合 module_status（规格 1.5）。"""
    statuses = {f.get("status", "draft") for f in fields}
    if statuses == {"confirmed"}:
        return "confirmed"
    if statuses == {"empty"}:
        return "empty"
    if statuses <= {"confirmed", "empty"}:
        return "partial" if "confirmed" in statuses else "empty"
    return "partial" if "confirmed" in statuses else "draft"


def _to_out(row: models.ProjectCognition) -> schemas.ProjectCognitionOut:
    raw = safe_json.loads_or(row.fields_json, [])
    fields = raw if isinstance(raw, list) else []
    return schemas.ProjectCognitionOut(
        id=row.id,
        project_id=row.project_id,
        module=row.module,
        module_label=row.module_label,
        schema_version=row.schema_version,
        fields=[schemas.CognitionField(**f) for f in fields],
        summary_md=row.summary_md,
        status=row.status,
        module_status=row.module_status,
        version=row.version,
        sources=[schemas.CognitionSourceOut(**s) for s in safe_json.loads_or(row.sources_json, [])],
        model=row.model,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _strip_fence(s: str) -> str:
    t = (s or "").strip()
    if t.startswith("```"):
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


def _build_field_records(extracted: dict, doc_ids: list) -> list:
    """把 LLM 抽取结果按 BRIEF_FIELD_SPECS 装配成字段记录数组（规格 1.2/1.3）。
    - high/medium: 有值则 draft+出处(doc)；空则 empty
    - low: 有值则 draft+推理依据(inference)，绝不 confirmed
    - manual_only: 不取 LLM 值，status=empty，输出引导问题
    """
    records = []
    for spec in schemas.BRIEF_FIELD_SPECS:
        key, ex = spec["key"], spec["extractable"]
        rec = {
            "key": key, "label": spec["label"], "type": spec["type"],
            "extractable": ex, "value": None, "status": "draft",
            "source": {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": None, "guide": "",
        }
        if ex == "manual_only":
            rec["status"] = "empty"
            rec["guide"] = schemas.MANUAL_GUIDE.get(key, "需人工判断填写")
            records.append(rec)
            continue
        val = extracted.get(key)
        has = val not in (None, "", [], {})
        if not has:
            rec["status"] = "empty"
            records.append(rec)
            continue
        rec["value"] = val
        rec["status"] = "draft"  # 抽取一律 draft，待人工审定（low 永远停在 draft）
        if ex in ("high", "medium"):
            rec["source"] = {"type": "doc", "doc_ids": doc_ids, "based_on": [], "doc_location": ""}
            rec["confidence"] = 0.8 if ex == "high" else 0.6
        else:  # low：判断，标推理依据
            rec["source"] = {"type": "inference", "doc_ids": [], "based_on": ["材料综合推理"], "doc_location": ""}
            rec["confidence"] = 0.4
        records.append(rec)
    return records


@router.post("/{project_id}/cognition/brief/extract", response_model=schemas.CognitionExtractOut)
def extract_brief(project_id: int, db: Session = Depends(get_db)) -> schemas.CognitionExtractOut:
    """AI 按 extractable 分档抽取任务书字段 → ProjectCognition(module=brief)。"""
    project = _project_or_404(db, project_id)
    cfg = _settings(db)
    if not cfg.deepseek_api_key:
        return schemas.CognitionExtractOut(status="not_configured", message=NOT_CONFIGURED_MSG)

    material = analysis.gather_material(db, project_id, query=f"{project.name} 任务书 设计任务 项目定位", top_k=5)
    if material.empty:
        return schemas.CognitionExtractOut(status="no_material", message=NO_MATERIAL_MSG)

    # 仅让 LLM 抽取 high/medium/low 字段（manual_only 不交给 AI）
    ai_fields = [f for f in schemas.BRIEF_FIELD_SPECS if f["extractable"] != "manual_only"]
    field_lines = "\n".join(f"  {f['key']}({f['label']}, {f['extractable']})" for f in ai_fields)
    sys_prompt = (
        "你是建筑方案前期任务书解读助手。" + schemas.SCOPE_CONSTRAINT + "\n"
        "只基于给定材料抽取字段，严格只输出 JSON 对象。规则："
        "high/medium 字段=明文事实，材料没有就留空字符串，绝不编造；"
        "low 字段=你的判断草案，给出但简洁；"
        "另给 _summary 键，30-60字概括项目核心。"
    )
    user_prompt = (
        f"项目：{project.name}\n需抽取字段(key 名)：\n{field_lines}\n\n"
        f"材料：\n{material.context}\n\n只输出 JSON：键为上述 key，值为字符串或字符串数组，外加 _summary。"
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
    src_dicts = analysis.sources_as_dicts(material.sources)
    doc_ids = [s["ref_id"] for s in src_dicts if s.get("kind") in ("project_file", "knowledge")]
    records = _build_field_records(data, doc_ids)

    row = models.ProjectCognition(
        project_id=project_id,
        module="brief",
        module_label="任务书",
        schema_version=schemas.SCHEMA_VERSION,
        scope_constraint=schemas.SCOPE_CONSTRAINT,
        fields_json=safe_json.dumps_safe(records, default="[]"),
        summary_md=summary,
        status="draft",
        module_status=_module_status(records),
        sources_json=safe_json.dumps_safe(src_dicts),
        model=cfg.deepseek_model,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.CognitionExtractOut(status="ok", cognition=_to_out(row))


@router.post("/{project_id}/cognition/{cog_id}/confirm", response_model=schemas.ProjectCognitionOut)
def confirm_cognition(project_id: int, cog_id: int, db: Session = Depends(get_db)):
    """人工审定：high/medium 的 draft 字段→confirmed；low/manual_only 需逐字段人工确认（不批量）。"""
    _project_or_404(db, project_id)
    row = db.get(models.ProjectCognition, cog_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "认知记录不存在")
    fields = safe_json.loads_or(row.fields_json, [])
    for f in fields:
        # 仅把 有值的 high/medium draft 字段批量确认；low(判断)/manual_only 留待人工逐条
        if f.get("status") == "draft" and f.get("extractable") in ("high", "medium") and f.get("value") not in (None, "", [], {}):
            f["status"] = "confirmed"
    row.fields_json = safe_json.dumps_safe(fields, default="[]")
    row.module_status = _module_status(fields)
    row.status = "confirmed" if row.module_status in ("confirmed", "partial") else row.status
    row.version += 1
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.put("/{project_id}/cognition/{cog_id}", response_model=schemas.ProjectCognitionOut)
def update_cognition(
    project_id: int, cog_id: int, updates: dict = Body(..., embed=True), db: Session = Depends(get_db)
):
    """人工编辑单字段：updates = {key: {"value":..., "status":"confirmed"}}。
    人工填的字段直接置 confirmed（人定即权威），manual_only 经此路径才有值。"""
    _project_or_404(db, project_id)
    row = db.get(models.ProjectCognition, cog_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "认知记录不存在")
    valid_keys = {f["key"] for f in schemas.BRIEF_FIELD_SPECS}
    fields = safe_json.loads_or(row.fields_json, [])
    by_key = {f["key"]: f for f in fields}
    for k, upd in (updates or {}).items():
        if k not in valid_keys or k not in by_key:
            continue
        f = by_key[k]
        if isinstance(upd, dict):
            if "value" in upd:
                f["value"] = upd["value"]
            f["status"] = upd.get("status", "confirmed")
            f["source"] = {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": "人工填写"}
        else:
            f["value"] = upd
            f["status"] = "confirmed"
            f["source"] = {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": "人工填写"}
    row.fields_json = safe_json.dumps_safe(fields, default="[]")
    row.module_status = _module_status(fields)
    row.version += 1
    db.commit()
    db.refresh(row)
    return _to_out(row)

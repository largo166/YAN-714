"""项目结构化认知 API（ProjectCognition Schema 规格 v1.0）。

把项目认知从"散文研判"升级为"受控 schema 槽位 + extractable 四档防假认知"。
A1-A8 模块均由 schemas.MODULE_FIELD_SPECS 注册表驱动同一套抽取逻辑（阶段2）：
- POST /api/projects/{id}/cognition/{module}/extract  AI 按 extractable 分档抽取 → 字段记录数组
  （module=brief 即 A1；通用参数化路由，不另设 brief 专用路由）
- GET  /api/projects/{id}/cognition                    读该项目所有认知
- GET  /api/projects/{id}/cognition/modules            模块清单（label/implemented）
- POST /api/projects/{id}/cognition/{cog_id}/confirm   人工审定（high/medium draft→confirmed）
- PUT  /api/projects/{id}/cognition/{cog_id}           人工编辑单字段 value+status

同一 project+module 复抽：更新既有行（不堆叠多份），version 递增。历史版本快照留【阶段6 版本层】。
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
NO_MATERIAL_MSG = "暂无可用正文材料：本项目无可全文解析的文件且知识库无命中，无法抽取认知（不伪造）。"


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


def _build_field_records(specs: list, guides: dict, extracted: dict, doc_ids: list) -> list:
    """把 LLM 抽取结果按字段描述表装配成字段记录数组（规格 1.2/1.3）。
    - high/medium: 有值则 draft+出处(doc)；空则 empty
    - low: 有值则 draft+推理依据(inference)，绝不 confirmed
    - manual_only: 不取 LLM 值，status=empty，输出引导问题
    """
    records = []
    for spec in specs:
        key, ex = spec["key"], spec["extractable"]
        rec = {
            "key": key, "label": spec["label"], "type": spec["type"],
            "extractable": ex, "value": None, "status": "draft",
            "source": {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": ""},
            "confidence": None, "guide": "",
        }
        if ex == "manual_only":
            rec["status"] = "empty"
            rec["guide"] = guides.get(key, "需人工判断填写")
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


@router.get("/{project_id}/cognition/modules")
def list_modules(project_id: int, db: Session = Depends(get_db)):
    """模块清单（label/implemented），供前端列出 A1-A8 可抽取模块。"""
    _project_or_404(db, project_id)
    return {
        "modules": [
            {"module": k, "label": v["label"], "implemented": v["implemented"]}
            for k, v in schemas.COGNITION_MODULES.items()
        ]
    }


def _extract_module(module: str, project_id: int, db: Session) -> schemas.CognitionExtractOut:
    """通用模块抽取：由 schemas.MODULE_FIELD_SPECS 注册表驱动 A1-A8 同一套分档逻辑。"""
    meta = schemas.COGNITION_MODULES.get(module)
    specs = schemas.module_field_specs(module)
    if meta is None or not meta.get("implemented") or not specs:
        raise HTTPException(404, f"未知或未实现的认知模块：{module}")
    label = meta["label"]
    project = _project_or_404(db, project_id)
    cfg = _settings(db)
    if not cfg.deepseek_api_key:
        return schemas.CognitionExtractOut(status="not_configured", message=NOT_CONFIGURED_MSG)

    hint = schemas.MODULE_QUERY_HINT.get(module, label)
    material = analysis.gather_material(db, project_id, query=f"{project.name} {hint}", top_k=5)
    if material.empty:
        return schemas.CognitionExtractOut(status="no_material", message=NO_MATERIAL_MSG)

    # 仅让 LLM 抽取 high/medium/low 字段（manual_only 不交给 AI）
    guides = schemas.module_guides(module)
    ai_fields = [f for f in specs if f["extractable"] != "manual_only"]
    field_lines = "\n".join(f"  {f['key']}({f['label']}, {f['extractable']})" for f in ai_fields)
    sys_prompt = (
        f"你是建筑方案前期助手，当前抽取模块：{label}。" + schemas.SCOPE_CONSTRAINT + "\n"
        "只基于给定材料抽取字段，严格只输出 JSON 对象。规则："
        "high/medium 字段=明文事实，材料没有就留空字符串，绝不编造；"
        "low 字段=你的判断草案，给出但简洁；"
        "另给 _summary 键，30-60字概括本模块核心。"
    )
    user_prompt = (
        f"项目：{project.name}\n模块：{label}\n需抽取字段(key 名)：\n{field_lines}\n\n"
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
    records = _build_field_records(specs, guides, data, doc_ids)

    # 同一项目同一 module 复抽：更新既有行（不堆叠多份），保留 id/version 递增
    row = (
        db.query(models.ProjectCognition)
        .filter(models.ProjectCognition.project_id == project_id, models.ProjectCognition.module == module)
        .order_by(models.ProjectCognition.created_at.desc())
        .first()
    )
    if row is None:
        row = models.ProjectCognition(project_id=project_id, module=module, version=0)
        db.add(row)
    row.module_label = label
    row.schema_version = schemas.SCHEMA_VERSION
    row.scope_constraint = schemas.SCOPE_CONSTRAINT
    row.fields_json = safe_json.dumps_safe(records, default="[]")
    row.summary_md = summary
    row.status = "draft"
    row.module_status = _module_status(records)
    row.sources_json = safe_json.dumps_safe(src_dicts)
    row.model = cfg.deepseek_model
    row.version = (row.version or 0) + 1
    db.commit()
    db.refresh(row)
    return schemas.CognitionExtractOut(status="ok", cognition=_to_out(row))


@router.post("/{project_id}/cognition/{module}/extract", response_model=schemas.CognitionExtractOut)
def extract_module(project_id: int, module: str, db: Session = Depends(get_db)) -> schemas.CognitionExtractOut:
    """AI 按 extractable 分档抽取某模块字段 → ProjectCognition(module=...)。A1-A8 通用。"""
    return _extract_module(module, project_id, db)


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
    人工填的字段直接置 confirmed（人定即权威），manual_only 经此路径才有值。
    红线：confirmed 必须有实质内容（不空值确认）；manual_only 填值后清掉引导问题/confidence（规格1.2-1.3）。"""
    _project_or_404(db, project_id)
    row = db.get(models.ProjectCognition, cog_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "认知记录不存在")
    # 合法 key = 该行(该 module)字段记录里已有的 key（A1-A8 通用，不再硬编码 BRIEF）
    fields = safe_json.loads_or(row.fields_json, [])
    by_key = {f["key"]: f for f in fields}
    for k, upd in (updates or {}).items():
        if k not in by_key:
            continue
        f = by_key[k]
        new_val = upd.get("value", f.get("value")) if isinstance(upd, dict) else upd
        new_status = upd.get("status", "confirmed") if isinstance(upd, dict) else "confirmed"
        empty = new_val in (None, "", [], {})
        # 不允许空值置 confirmed（与 confirm_cognition 的非空校验对称，避免"已确认但无内容"歧义）
        if new_status == "confirmed" and empty:
            raise HTTPException(400, f"字段 {k} 不能以空值确认（不伪造）")
        f["value"] = new_val
        f["status"] = new_status
        f["source"] = {"type": "manual", "doc_ids": [], "based_on": [], "doc_location": "人工填写"}
        # manual_only 一旦人工填值并确认，清掉引导问题与 confidence（规格1.2：manual_only confidence 恒 null）
        if f.get("extractable") == "manual_only" and new_status == "confirmed":
            f["guide"] = ""
            f["confidence"] = None
    row.fields_json = safe_json.dumps_safe(fields, default="[]")
    row.module_status = _module_status(fields)
    row.version += 1
    db.commit()
    db.refresh(row)
    return _to_out(row)

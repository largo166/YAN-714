"""会议成果交付中心 API（4E）。

创建会议（贴记录文本 / 上传材料 txt·md·docx·pdf）→ 生成五段式纪要 → 双版 →
Word 正式导出 / 打印 HTML（MD 降为隐藏调试）→ 人工确认 →
（可选）腾讯会议真实创建 + 会后同步纪要。三态不伪造。
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse, HTMLResponse, Response
from sqlalchemy.orm import Session

from .. import exporters, llm, meeting, models, parsing, safe_json, schemas, slang, transcription
from ..database import get_db
from ..providers import tencent_meeting

router = APIRouter(prefix="/api/projects", tags=["meetings"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "会议记录为空，无法生成纪要。请先粘贴会议记录或上传材料。"


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


def _meeting_or_404(db: Session, project_id: int, meeting_id: int) -> models.Meeting:
    m = db.get(models.Meeting, meeting_id)
    if m is None or m.project_id != project_id:
        raise HTTPException(404, "会议不存在")
    return m


def _meeting_detail(m: models.Meeting) -> schemas.MeetingDetailOut:
    segs = safe_json.loads_or(m.segments_json, [])
    return schemas.MeetingDetailOut(
        id=m.id, project_id=m.project_id, title=m.title, meeting_date=m.meeting_date,
        attendees=m.attendees, transcript_source=m.transcript_source, status=m.status,
        provider=m.provider, tencent_meeting_code=m.tencent_meeting_code,
        tencent_join_url=m.tencent_join_url, tencent_start_time=m.tencent_start_time,
        tencent_end_time=m.tencent_end_time, tencent_status=m.tencent_status,
        tencent_meeting_id=m.tencent_meeting_id,
        created_at=m.created_at, updated_at=m.updated_at,
        raw_text=m.raw_text,
        segments=[schemas.TranscriptSegment(**s) for s in segs] if isinstance(segs, list) else [],
    )


@router.post("/{project_id}/meetings", response_model=schemas.MeetingDetailOut, status_code=201)
def create_meeting(project_id: int, payload: schemas.MeetingCreateIn, db: Session = Depends(get_db)):
    """创建会议（贴会议记录文本）。"""
    _project_or_404(db, project_id)
    segs = transcription.text_to_segments(payload.raw_text)
    m = models.Meeting(
        project_id=project_id, title=payload.title, meeting_date=payload.meeting_date,
        attendees=payload.attendees, raw_text=payload.raw_text,
        segments_json=safe_json.dumps_safe(transcription.segments_to_dicts(segs)),
        transcript_source="text", status="created",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _meeting_detail(m)


@router.post("/{project_id}/meetings/material", response_model=schemas.MeetingDetailOut, status_code=201)
async def create_meeting_from_material(
    project_id: int,
    title: str = Form("未命名会议"),
    meeting_date: str = Form(""),
    attendees: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传材料（txt/md/docx/pdf）解析为会议记录文本并创建会议。"""
    _project_or_404(db, project_id)
    if not parsing.is_supported(file.filename or ""):
        raise HTTPException(400, "仅支持 txt/md/docx/pdf 材料")
    data = await file.read()
    # 写临时文件解析（不落 uploads，材料仅取文本）
    import tempfile, os
    suffix = "." + (file.filename or "x").rsplit(".", 1)[-1]
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        tmp.write(data)
        tmp.close()
        pr = parsing.parse_file(tmp.name)
    finally:
        os.unlink(tmp.name)
    if pr.status not in ("ok", "ok_truncated") or not pr.text.strip():
        raise HTTPException(400, f"材料无可用文本（{pr.status}），无法创建会议（不伪造）")

    segs = transcription.text_to_segments(pr.text)
    m = models.Meeting(
        project_id=project_id, title=title, meeting_date=meeting_date, attendees=attendees,
        raw_text=pr.text, segments_json=safe_json.dumps_safe(transcription.segments_to_dicts(segs)),
        transcript_source="material", status="created",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _meeting_detail(m)


@router.get("/{project_id}/meetings", response_model=schemas.MeetingListOut)
def list_meetings(project_id: int, db: Session = Depends(get_db)):
    _project_or_404(db, project_id)
    items = (
        db.query(models.Meeting)
        .filter(models.Meeting.project_id == project_id)
        .order_by(models.Meeting.created_at.desc())
        .all()
    )
    return schemas.MeetingListOut(items=items, total=len(items))


@router.get("/{project_id}/meetings/{meeting_id}", response_model=schemas.MeetingDetailOut)
def get_meeting(project_id: int, meeting_id: int, db: Session = Depends(get_db)):
    return _meeting_detail(_meeting_or_404(db, project_id, meeting_id))


@router.post("/{project_id}/meetings/{meeting_id}/minute", response_model=schemas.MeetingMinuteOut)
def generate_minute(project_id: int, meeting_id: int, db: Session = Depends(get_db)):
    """生成五段式纪要。三态不伪造。"""
    m = _meeting_or_404(db, project_id, meeting_id)
    cfg = _settings(db)
    configured = bool(cfg.deepseek_api_key)
    segs = safe_json.loads_or(m.segments_json, [])
    parsed = None

    if not isinstance(segs, list) or not segs:
        status, model, err = "no_material", "", ""
    elif not configured:
        status, model, err = "not_configured", "", ""
    else:
        messages = meeting.build_prompt(m.title, segs)
        try:
            answer = llm.chat_completion(
                messages, api_key=cfg.deepseek_api_key,
                base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
            )
            parsed = meeting.parse_minute(answer)
            status, model, err = "ok", cfg.deepseek_model, ""
        except llm.NotConfigured:
            status, model, err = "not_configured", "", ""
        except llm.LLMError as e:
            status, model, err = "error", cfg.deepseek_model, str(e)

    p = parsed or {}
    row = models.MeetingMinute(
        meeting_id=meeting_id, gen_status=status,
        summary_json=safe_json.dumps_safe(p.get("summary", [])),
        core_items_json=safe_json.dumps_safe(p.get("core_items", [])),
        demand_internal_json=safe_json.dumps_safe(p.get("demand_internal", [])),
        demand_external_json=safe_json.dumps_safe(p.get("demand_external", [])),
        decisions_json=safe_json.dumps_safe(p.get("decisions", [])),
        todos_json=safe_json.dumps_safe(p.get("todos", [])),
        review_status="draft", model=model, error_message=err,
    )
    db.add(row)
    m.status = "minuted"
    db.commit()
    db.refresh(row)
    return _minute_out(row)


@router.post("/{project_id}/meetings/from-file")
def minute_from_file(project_id: int, payload: schemas.MinuteFromFileIn, db: Session = Depends(get_db)) -> dict:
    """共创营地"生成这份文件的会议纪要"路由入口:用已上传项目文件原文 → 建会议 → 出正式纪要。

    复用 create_meeting + generate_minute,产物进会议成果交付中心(可查看/导出 Word/抽取待办/回流);
    同时返回渲染好的 markdown 供共创营地对话流直接展示。
    """
    _project_or_404(db, project_id)
    pf = db.get(models.ProjectFile, payload.file_id)
    if pf is None or pf.project_id != project_id or pf.status != "active":
        raise HTTPException(404, "文件不存在或不属于本项目")
    text = (pf.content_text or "").strip()
    if not text:
        raise HTTPException(400, "该文件没有可用文本(可能是扫描件/需OCR),无法生成纪要")

    segs = transcription.text_to_segments(text)
    title = (payload.title or "").strip() or f"纪要-{pf.filename}"
    m = models.Meeting(
        project_id=project_id, title=title, meeting_date="", attendees="",
        raw_text=text, segments_json=safe_json.dumps_safe(transcription.segments_to_dicts(segs)),
        transcript_source="material", status="created",
    )
    db.add(m)
    db.commit()
    db.refresh(m)

    minute = generate_minute(project_id, m.id, db)  # 复用正式纪要生成(五段式 + todos)
    row = db.get(models.MeetingMinute, minute.id)
    md = ""
    if minute.gen_status == "ok" and row is not None:
        md = meeting.render_markdown(m.title, _minute_dict(row), review_status=row.review_status, external_only=True)
    return {
        "meeting_id": m.id,
        "minute_id": minute.id,
        "title": m.title,
        "gen_status": minute.gen_status,
        "markdown": md,
        "error": (row.error_message if row else "") or "",
    }


@router.get("/{project_id}/meetings/{meeting_id}/minute", response_model=schemas.MeetingMinuteOut)
def get_latest_minute(project_id: int, meeting_id: int, db: Session = Depends(get_db)):
    _meeting_or_404(db, project_id, meeting_id)
    row = (
        db.query(models.MeetingMinute)
        .filter(models.MeetingMinute.meeting_id == meeting_id)
        .order_by(models.MeetingMinute.created_at.desc())
        .first()
    )
    if row is None:
        raise HTTPException(404, "尚未生成纪要")
    return _minute_out(row)


@router.post("/{project_id}/meetings/{meeting_id}/minute/{minute_id}/confirm", response_model=schemas.MeetingMinuteOut)
def confirm_minute(project_id: int, meeting_id: int, minute_id: int, db: Session = Depends(get_db)):
    """人工审定（draft→confirmed）。"""
    _meeting_or_404(db, project_id, meeting_id)
    row = db.get(models.MeetingMinute, minute_id)
    if row is None or row.meeting_id != meeting_id:
        raise HTTPException(404, "纪要不存在")
    row.review_status = "confirmed"
    db.commit()
    db.refresh(row)
    return _minute_out(row)


@router.post(
    "/{project_id}/meetings/{meeting_id}/minute/{minute_id}/reflow",
    response_model=schemas.ReflowOut,
)
def reflow_minute(project_id: int, meeting_id: int, minute_id: int, db: Session = Depends(get_db)):
    """把已确认纪要待办标记为已回流项目下一步。幂等，不重复计数。"""
    _meeting_or_404(db, project_id, meeting_id)
    row = db.get(models.MeetingMinute, minute_id)
    if row is None or row.meeting_id != meeting_id:
        raise HTTPException(404, "纪要不存在")
    if row.review_status != "confirmed":
        raise HTTPException(400, "纪要未确认，不能回流")
    todos = safe_json.loads_or(row.todos_json, [])
    count = len(todos) if isinstance(todos, list) else 0
    if row.reflowed:
        return schemas.ReflowOut(status="ok", reflowed_count=0)
    row.reflowed = True
    db.commit()
    return schemas.ReflowOut(status="ok", reflowed_count=count)


def _minute_or_404(db: Session, meeting_id: int, minute_id: int) -> models.MeetingMinute:
    row = db.get(models.MeetingMinute, minute_id)
    if row is None or row.meeting_id != meeting_id:
        raise HTTPException(404, "纪要不存在")
    return row


@router.get("/{project_id}/meetings/{meeting_id}/minute/{minute_id}/export.docx")
def export_docx(
    project_id: int, meeting_id: int, minute_id: int,
    variant: str = "external", db: Session = Depends(get_db),
):
    """Word 正式导出。variant=external（对外，默认，不含对内研判）| internal（对内）。"""
    m = _meeting_or_404(db, project_id, meeting_id)
    project = _project_or_404(db, project_id)
    row = _minute_or_404(db, meeting_id, minute_id)
    internal = variant == "internal"
    data = _minute_dict(row)
    blob = exporters.build_docx(m.title, data, internal=internal)
    tag = "对内研判版" if internal else "对外纪要版"
    fname = exporters.safe_filename(project.name, m.title, tag) + ".docx"
    from urllib.parse import quote
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


@router.get("/{project_id}/meetings/{meeting_id}/minute/{minute_id}/print", response_class=HTMLResponse)
def print_minute(
    project_id: int, meeting_id: int, minute_id: int,
    internal: bool = False, db: Session = Depends(get_db),
):
    """打印友好 HTML（前端 window.print() 保存 PDF）。"""
    m = _meeting_or_404(db, project_id, meeting_id)
    row = _minute_or_404(db, meeting_id, minute_id)
    html = exporters.build_print_html(m.title, _minute_dict(row), internal=internal)
    return HTMLResponse(content=html)


@router.get("/{project_id}/meetings/{meeting_id}/minute/{minute_id}/export.md",
            response_class=PlainTextResponse, include_in_schema=False)
def export_minute_md(
    project_id: int, meeting_id: int, minute_id: int,
    internal: bool = False, db: Session = Depends(get_db),
):
    """[隐藏调试] MD 导出。正式交付请用 export.docx。"""
    m = _meeting_or_404(db, project_id, meeting_id)
    row = _minute_or_404(db, meeting_id, minute_id)
    data = _minute_dict(row)
    md = meeting.render_markdown(m.title, data, review_status=row.review_status, external_only=not internal)
    return PlainTextResponse(content=md, media_type="text/markdown; charset=utf-8")


def _minute_dict(row: models.MeetingMinute) -> dict:
    return {
        "summary": safe_json.loads_or(row.summary_json, []),
        "core_items": safe_json.loads_or(row.core_items_json, []),
        "demand_internal": safe_json.loads_or(row.demand_internal_json, []),
        "demand_external": safe_json.loads_or(row.demand_external_json, []),
        "decisions": safe_json.loads_or(row.decisions_json, []),
        "todos": safe_json.loads_or(row.todos_json, []),
    }


def _minute_out(row: models.MeetingMinute) -> schemas.MeetingMinuteOut:
    d = _minute_dict(row)
    return schemas.MeetingMinuteOut(
        id=row.id, meeting_id=row.meeting_id, gen_status=row.gen_status,
        summary=d["summary"] if isinstance(d["summary"], list) else [],
        core_items=d["core_items"] if isinstance(d["core_items"], list) else [],
        demand_internal=[schemas.DemandItem(**x) for x in d["demand_internal"]] if isinstance(d["demand_internal"], list) else [],
        demand_external=[schemas.DemandItem(**x) for x in d["demand_external"]] if isinstance(d["demand_external"], list) else [],
        decisions=d["decisions"] if isinstance(d["decisions"], list) else [],
        todos=[schemas.TodoItem(**x) for x in d["todos"]] if isinstance(d["todos"], list) else [],
        review_status=row.review_status, reflowed=row.reflowed,
        model=row.model, error_message=row.error_message,
        created_at=row.created_at,
    )


# ── 腾讯会议 provider（可选）──
@router.post("/{project_id}/tencent/quick", response_model=schemas.MeetingDetailOut, status_code=201)
def quick_tencent_meeting(project_id: int, db: Session = Depends(get_db)):
    """一键创建腾讯会议（零输入）：默认主题+默认时间(现在起1小时)→provider→落库→返回会议号/链接。

    未配→not_configured(400)；失败→provider_unavailable(502)。绝不伪造链接。
    """
    project = _project_or_404(db, project_id)
    if not tencent_meeting.is_configured():
        raise HTTPException(400, "腾讯会议未配置（缺 token 或本机 skill），无法创建")

    from datetime import datetime, timedelta
    now = datetime.now().astimezone()
    start = now.replace(microsecond=0).isoformat()
    end = (now + timedelta(hours=1)).replace(microsecond=0).isoformat()
    subject = f"{project.name} 讨论 {now.strftime('%Y-%m-%d %H:%M')}"

    r = tencent_meeting.create_meeting(subject, start, end)
    if r.status == "not_configured":
        raise HTTPException(400, "腾讯会议未配置")
    if r.status != "ok":
        raise HTTPException(502, f"腾讯会议创建失败：{r.message}")

    m = models.Meeting(
        project_id=project_id, title=subject, meeting_date=now.strftime("%Y-%m-%d"),
        raw_text="", segments_json="[]", transcript_source="text", status="created",
        provider="tencent", tencent_meeting_id=r.meeting_id, tencent_meeting_code=r.meeting_code,
        tencent_join_url=r.join_url, tencent_start_time=r.start_time, tencent_end_time=r.end_time,
        tencent_status="created",
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _meeting_detail(m)


@router.post("/{project_id}/meetings/{meeting_id}/tencent", response_model=schemas.MeetingDetailOut)
def create_tencent_meeting(
    project_id: int, meeting_id: int, payload: schemas.TencentCreateIn,
    db: Session = Depends(get_db),
):
    """为已有会议创建真实腾讯会议（需 confirm=true 二次确认）。未配/失败不伪造。"""
    m = _meeting_or_404(db, project_id, meeting_id)
    if not payload.confirm:
        raise HTTPException(400, "需 confirm=true 二次确认才创建真实腾讯会议")
    if not tencent_meeting.is_configured():
        raise HTTPException(400, "腾讯会议未配置（缺 token 或本机 skill），无法创建")

    start = m.tencent_start_time or m.meeting_date or ""
    # 缺少起止时间时由前端传 meeting_date；这里要求 start/end 已在 meeting_date 给出 ISO，否则报错不伪造
    r = tencent_meeting.create_meeting(m.title, m.tencent_start_time or start, m.tencent_end_time or start)
    if r.status == "not_configured":
        raise HTTPException(400, "腾讯会议未配置")
    if r.status != "ok":
        raise HTTPException(502, f"腾讯会议创建失败：{r.message}")

    m.provider = "tencent"
    m.tencent_meeting_id = r.meeting_id
    m.tencent_meeting_code = r.meeting_code
    m.tencent_join_url = r.join_url
    m.tencent_start_time = r.start_time
    m.tencent_end_time = r.end_time
    m.tencent_status = "created"
    db.commit()
    db.refresh(m)
    return _meeting_detail(m)


@router.post("/{project_id}/meetings/{meeting_id}/tencent/sync", response_model=schemas.TencentSyncOut)
def sync_tencent_minutes(project_id: int, meeting_id: int, db: Session = Depends(get_db)):
    """会后同步腾讯智能纪要 + 转写。无录制→no_recording；纪要未生成→transcript_pending。"""
    m = _meeting_or_404(db, project_id, meeting_id)
    if not m.tencent_meeting_id:
        raise HTTPException(400, "该会议未关联腾讯会议")
    r = tencent_meeting.sync_minutes(m.tencent_meeting_id)
    # 同步成功则把纪要文本回填会议 raw_text（供后续 ROM-AI 分析；人工可再编辑）
    if r.status in ("ok", "transcript_pending"):
        text = r.minutes or r.transcript
        if text:
            m.raw_text = (m.raw_text + "\n\n[腾讯同步]\n" + text) if m.raw_text else text
            segs = transcription.text_to_segments(m.raw_text)
            m.segments_json = safe_json.dumps_safe(transcription.segments_to_dicts(segs))
            db.commit()
    return schemas.TencentSyncOut(
        status=r.status, minutes=r.minutes, transcript=r.transcript, message=r.message,
    )


# ── 甲方诉求翻译器 ──
@router.get("/{project_id}/slang")
def query_slang(project_id: int, q: str = "", db: Session = Depends(get_db)):
    """查询诉求翻译词条（原话/真实含义/设计影响/建议动作）。"""
    _project_or_404(db, project_id)
    return {"items": slang.query(q), "query": q}

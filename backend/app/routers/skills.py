"""共创营地 · 内置技能目录 + 技能执行链路（E2）。

运行时独立（规则 9）：技能能力内置于本体，安装后离线可读。
- GET /api/skills：只读返回技能目录，供前端渲染「可调度技能」卡。
- POST /api/projects/{id}/skills/{skill_id}/run：围绕当前项目 + 知识库检索执行技能，
  产出结构化成果卡（标题/正文/出处）。复用 analysis 的 RAG 装配 + llm。
  红线：未配 key→not_configured 不伪造；无材料→no_material；不自动串跑（规则 9）。
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, llm, models, schemas, skill_structured, safe_json, image_gen, uploads
from ..database import get_db

router = APIRouter(tags=["skills"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "暂无可用材料：本项目无可解析文件且知识库无命中。请先上传资料或补充知识库后再执行。"

# 对齐 HTML 权威稿 共创营地 6 张技能卡（id/标题/来源/示例提示与效果图一致）。
_SKILLS = [
    {"id": "ppt", "title": "PPT 大纲生成", "icon": "▤", "source": "读知识库 + 项目数据",
     "example": "帮我做一版方案汇报 PPT", "status": "待命"},
    {"id": "img", "title": "AI 生图 · 意向图", "icon": "🖼", "source": "APImart 真出图 · 存项目",
     "example": "生成几张退台立面意向图", "status": "待命"},
    {"id": "review", "title": "方案评审", "icon": "◷", "source": "案例策略 + 方法模板比对",
     "example": "对这版方案做评审，再对标一个类比项目", "status": "待命"},
    {"id": "task", "title": "任务安排生成", "icon": "✓", "source": "→ 写回项目中心 下一步",
     "example": "把需求拆成任务安排和下一步", "status": "待命"},
    {"id": "meeting", "title": "会议纪要", "icon": "🔊", "source": "转写 + 甲方诉求转译",
     "example": "把会议录音转成纪要并排好待办", "status": "待命"},
    {"id": "compete", "title": "竞品分析", "icon": "◰", "source": "读知识库类比项目",
     "example": "找一个类比项目做竞品分析", "status": "待命"},
]

# 技能执行 prompt 模板（id -> 成果标题 + 指令 + 是否需检索 RAG）
_SKILL_PROMPTS = {
    "ppt": ("PPT 大纲", "请基于材料生成一份方案汇报 PPT 大纲：逐页给出页标题与该页要点（每页 2-4 条）。", True),
    "review": ("方案评审意见", "请基于材料对当前方案做评审：分『优点 / 待改进问题 / 具体建议』三段，逐条说明依据。", True),
    "task": ("任务安排", "请基于材料拆解可执行任务清单：每条含『任务 / 建议负责角色 / 优先级 / 建议时序』。", True),
    "compete": ("竞品分析", "请从材料与知识库中找出类比项目，做对标分析：可比维度、各自做法、对本项目的借鉴。", True),
    "meeting": ("会议纪要要点", "请基于材料提炼会议要点：背景、关键结论、甲方诉求、风险分歧、下一步。", True),
    "img": ("生图提示词", "请基于材料生成若干条 AI 生图提示词（中英各一版），用于方案意向图；仅输出提示词文本，不生成图片。", False),
}


def _settings(db: Session) -> models.AppSetting:
    row = db.get(models.AppSetting, 1)
    if row is None:
        row = models.AppSetting(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/api/skills", response_model=schemas.SkillListOut)
def list_skills() -> schemas.SkillListOut:
    """返回内置技能目录（只读，不触发任何执行）。"""
    return schemas.SkillListOut(items=_SKILLS, total=len(_SKILLS))


@router.post(
    "/api/projects/{project_id}/skills/{skill_id}/run",
    response_model=schemas.SkillRunOut,
)
def run_skill(
    project_id: int, skill_id: str, payload: schemas.SkillRunIn, db: Session = Depends(get_db)
) -> schemas.SkillRunOut:
    """执行技能 → 成果卡。围绕当前项目 + 项目级知识检索做 RAG，不伪造（规则 3/9/10）。"""
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "项目不存在")
    if skill_id not in _SKILL_PROMPTS:
        raise HTTPException(400, f"未知技能：{skill_id}")

    title, instruction, needs_rag = _SKILL_PROMPTS[skill_id]
    cfg = _settings(db)
    configured = bool(cfg.deepseek_api_key)

    # 取材：项目文件 + 项目级知识检索（沿用 analysis.gather_material，已支持 project_file 路）
    query = f"{project.name} {title} {payload.input}".strip()
    material = analysis.gather_material(db, project_id, query=query, top_k=5)
    sources = [schemas.SkillSourceOut(**s) for s in analysis.sources_as_dicts(material.sources)]

    if not configured:
        return schemas.SkillRunOut(
            skill_id=skill_id, status="not_configured", title=title,
            content=NOT_CONFIGURED_MSG, sources=[],
        )

    # ── 结构化技能：PPT 大纲 / 会议纪要（json mode + normalizer 兜底 + markdown）──
    if skill_id == "ppt":
        if material.empty:
            return schemas.SkillRunOut(skill_id=skill_id, status="no_material", title=title, content=NO_MATERIAL_MSG)
        n = skill_structured.slide_count_from_input(payload.input)
        sysp, userp, fmt = skill_structured.build_ppt_prompt(project.name, material.context or "", payload.input, n)
        try:
            answer = llm.chat_completion(
                [{"role": "system", "content": sysp}, {"role": "user", "content": userp}],
                api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
                response_format=fmt, timeout=120.0,
            )
        except llm.LLMError as e:
            return schemas.SkillRunOut(skill_id=skill_id, status="error", title=title,
                                       content="AI 调用失败，请稍后重试或检查设置。", model=cfg.deepseek_model, error_message=str(e))
        result = skill_structured.normalize_ppt(skill_structured.parse_json_loose(answer), n)
        return schemas.SkillRunOut(
            skill_id=skill_id, status="ok", title="PPT 大纲",
            content=skill_structured.ppt_to_markdown(result),
            output_json=safe_json.dumps_safe(result), sources=sources, model=cfg.deepseek_model,
        )

    if skill_id == "meeting":
        # 取材优先用项目最新会议的转写原文（比纯检索更贴会议纪要）
        latest = (
            db.query(models.Meeting)
            .filter(models.Meeting.project_id == project_id)
            .order_by(models.Meeting.created_at.desc())
            .first()
        )
        transcript = (latest.raw_text if latest else "") or material.context or ""
        if not transcript.strip():
            return schemas.SkillRunOut(skill_id=skill_id, status="no_material", title=title,
                                       content="本项目暂无会议转写,也无可用材料。请先创建会议/上传转写后再生成纪要。")
        sysp, userp, fmt = skill_structured.build_meeting_prompt(project.name, transcript, payload.input)
        try:
            answer = llm.chat_completion(
                [{"role": "system", "content": sysp}, {"role": "user", "content": userp}],
                api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
                response_format=fmt, timeout=120.0,
            )
        except llm.LLMError as e:
            return schemas.SkillRunOut(skill_id=skill_id, status="error", title=title,
                                       content="AI 调用失败，请稍后重试或检查设置。", model=cfg.deepseek_model, error_message=str(e))
        result = skill_structured.normalize_meeting(skill_structured.parse_json_loose(answer))
        return schemas.SkillRunOut(
            skill_id=skill_id, status="ok", title="会议纪要",
            content=skill_structured.meeting_to_markdown(result),
            output_json=safe_json.dumps_safe(result),
            sources=sources if latest is None else [], model=cfg.deepseek_model,
        )

    # ── 生图技能:DeepSeek 据材料生成提示词 → APImart 真出图 → 下载存项目 uploads ──
    if skill_id == "img":
        # 未配生图 key:如实提示,绝不伪造图(规则 3/10)。文本 key 单独判过。
        if not image_gen.is_configured():
            return schemas.SkillRunOut(skill_id=skill_id, status="not_configured", title="AI 生图",
                                       content=image_gen.NOT_CONFIGURED_MSG)
        # 1) DeepSeek 据项目材料生成一条生图提示词(无材料也可,基于项目名)
        ctx = material.context or f"项目：{project.name}"
        gen_user = (
            f"{ctx}\n\n请为本建筑项目生成一条用于 AI 出『方案意向图/效果图』的英文生图提示词,"
            f"突出建筑风格、立面材质、光线氛围、视角,写实风格;只输出一段提示词文本,不要解释。"
            + (f"\n用户补充:{payload.input.strip()}" if payload.input.strip() else "")
        )
        try:
            prompt = llm.chat_completion(
                [{"role": "user", "content": gen_user}],
                api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
            ).strip()
        except llm.LLMError as e:
            return schemas.SkillRunOut(skill_id=skill_id, status="error", title="AI 生图",
                                       content="生成提示词失败。", error_message=str(e))
        # 2) 真出图(异步制,内部轮询)
        res = image_gen.generate_image(prompt, model=payload.model)
        if res.status == "not_configured":
            return schemas.SkillRunOut(skill_id=skill_id, status="not_configured", title="AI 生图", content=res.message)
        if res.status != "ok" or not res.image_bytes:
            return schemas.SkillRunOut(skill_id=skill_id, status="error", title="AI 生图",
                                       content="生图失败,未出图(不伪造)。", error_message=res.message)
        # 3) 下载的字节存进项目 uploads(本地,不依赖 24h 过期 URL)
        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(res.mime, "png")
        try:
            stored = uploads.save_upload(project_id, f"AI生图-{res.model}.{ext}", res.image_bytes)
        except Exception as exc:  # noqa: BLE001
            return schemas.SkillRunOut(skill_id=skill_id, status="error", title="AI 生图",
                                       content="图片存盘失败。", error_message=str(exc))
        return schemas.SkillRunOut(
            skill_id=skill_id, status="ok", title="AI 生图 · 意向图",
            content=f"已生成意向图（{res.model}）。提示词:\n{prompt}",
            image_url=stored.stored_path, image_model=res.model, model=cfg.deepseek_model,
        )

    # 需检索的技能：无材料则不伪造；不需检索的(生图提示词)允许无材料直接生成
    if needs_rag and material.empty:
        return schemas.SkillRunOut(
            skill_id=skill_id, status="no_material", title=title,
            content=NO_MATERIAL_MSG, sources=[],
        )

    msgs = []
    if material.context:
        msgs.append({"role": "system", "content": material.context})
    user = f"项目：{project.name}\n\n技能：{title}\n指令：{instruction}"
    if payload.input.strip():
        user += f"\n\n用户补充：{payload.input.strip()}"
    user += "\n\n要求：条理清晰、可执行；如材料不足请明确指出，不要臆测。"
    msgs.append({"role": "user", "content": user})

    try:
        answer = llm.chat_completion(
            msgs, api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url,
            model=cfg.deepseek_model,
        )
        return schemas.SkillRunOut(
            skill_id=skill_id, status="ok", title=title, content=answer,
            sources=sources if needs_rag else [], model=cfg.deepseek_model,
        )
    except llm.NotConfigured:
        return schemas.SkillRunOut(
            skill_id=skill_id, status="not_configured", title=title,
            content=NOT_CONFIGURED_MSG, sources=[],
        )
    except llm.LLMError as e:
        return schemas.SkillRunOut(
            skill_id=skill_id, status="error", title=title,
            content="AI 调用失败，请稍后重试或检查设置。", model=cfg.deepseek_model,
            error_message=str(e),
        )

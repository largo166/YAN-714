"""共创营地 · 内置技能目录 + 技能执行链路（E2）。

运行时独立（规则 9）：技能能力内置于本体，安装后离线可读。
- GET /api/skills：只读返回技能目录，供前端渲染「可调度技能」卡。
- POST /api/projects/{id}/skills/{skill_id}/run：围绕当前项目 + 知识库检索执行技能，
  产出结构化成果卡（标题/正文/出处）。复用 analysis 的 RAG 装配 + llm。
  红线：未配 key→not_configured 不伪造；无材料→no_material；不自动串跑（规则 9）。
"""
import base64
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import analysis, llm, models, schemas, skill_structured, structured_judgment, safe_json, image_gen, uploads, exporters, review_checklist, image_assets, moa
from ..database import get_db

router = APIRouter(tags=["skills"])

NOT_CONFIGURED_MSG = "AI 引擎未配置，请先在设置中配置 API Key"
NO_MATERIAL_MSG = "暂无可用材料：本项目无可解析文件且知识库无命中。请先上传资料或补充知识库后再执行。"

# 共创营地技能库:5 分类 × 颜色(对齐 DC 设计稿)。
_CAT_CONCEPT = ("概念与方案", "#7c5cff")
_CAT_RESEARCH = ("竞品与研究", "#42a5ff")
_CAT_TEXT = ("文本与汇报", "#d7a86e")
_CAT_VISUAL = ("出图与表现", "#36e6d4")
_CAT_REVIEW = ("审查与合规", "#ff5e66")


def _skill(sid, title, icon, source, example, cat):
    return {"id": sid, "title": title, "icon": icon, "source": source, "example": example,
            "status": "待命", "category": cat[0], "color": cat[1]}


# 技能目录(20+):前 8 个已接真实执行链路;新增 14 个本期接入(文本类走结构化/文本,视觉类走生图)。
_SKILLS = [
    # ── 概念与方案 ──
    _skill("concept", "概念激发", "✦", "项目材料 + 设计灵感", "基于场地生成 3 个概念方向", _CAT_CONCEPT),
    _skill("massing", "体量推敲", "◳", "场地条件 + 退台策略", "给这个地块推几个体量与退台比选", _CAT_CONCEPT),
    _skill("compare", "方案比选", "⊞", "多方案评图 + 设计判断", "比较 A/B/C 三版方案优劣并推荐", _CAT_CONCEPT),
    _skill("facade", "立面生成", "⌂", "生图 · 公建化立面", "生成一版退台公建化立面意向", _CAT_VISUAL),
    # ── 竞品与研究 ──
    _skill("compete", "竞品对标", "◎", "读知识库类比项目", "找一个类比项目做竞品对标", _CAT_RESEARCH),
    _skill("caselib", "案例库检索", "❑", "按类型学检索标杆", "检索同类江景高端住宅标杆案例", _CAT_RESEARCH),
    _skill("condition", "规划条件解读", "⛓", "红线/容积率/限高拆解", "把这块地的规划条件拆解成设计约束", _CAT_RESEARCH),
    # ── 文本与汇报 ──
    _skill("ppt", "PPT 大纲生成", "▤", "读知识库 + 项目数据", "帮我做一版方案汇报 PPT", _CAT_TEXT),
    _skill("writer", "投标文本", "✎", "技术标设计说明", "起草一段以江为脉的设计立意说明", _CAT_TEXT),
    _skill("brief", "汇报提纲", "❡", "甲方汇报结构与说辞", "生成一份 15 分钟甲方汇报提纲", _CAT_TEXT),
    _skill("poster", "一页纸海报", "◰", "方案核心信息可视化", "把方案核心信息浓缩成一页纸要点", _CAT_TEXT),
    _skill("slang", "甲方黑话翻译", "⇄", "甲方口径转设计语言", "把甲方这段话翻译成设计语言与红线", _CAT_TEXT),
    _skill("meeting", "会议纪要", "🔊", "转写 + 甲方诉求转译", "把会议记录转成纪要并排好待办", _CAT_TEXT),
    # ── 出图与表现 ──
    _skill("img", "AI 生图 · 意向图", "🖼", "APImart 真出图 · 存项目", "生成几张退台立面意向图", _CAT_VISUAL),
    _skill("director", "效果图导演", "☉", "组织出图视角脚本", "为这版方案规划人视/鸟瞰/序列出图脚本", _CAT_VISUAL),
    _skill("shotlist", "视角脚本", "⊟", "人视/鸟瞰/序列分镜", "列出投标效果图的关键视角清单", _CAT_VISUAL),
    _skill("moodboard", "风格参考板", "▦", "生图 · 材质与氛围", "生成一版宋韵 + 江景的风格参考意向", _CAT_VISUAL),
    # ── 审查与合规 ──
    _skill("review", "方案评审", "◷", "案例策略 + 方法模板比对", "对这版方案做评审，再对标一个类比项目", _CAT_REVIEW),
    _skill("judge", "节点督办", "⏱", "盯紧里程碑与逾期风险", "扫一遍在推项目挑出今天最该处理的风险", _CAT_REVIEW),
    _skill("norm", "规范审查", "⚖", "日照/间距/消防自检", "对这版总图做一次规范合规自检", _CAT_REVIEW),
    _skill("task", "任务安排生成", "✓", "→ 一键落任务看板", "把需求拆成任务安排和下一步", _CAT_REVIEW),
    _skill("flow", "定义工作流", "⛢", "设计—出图—评审流程", "给这个投标搭一条标准协作流水线", _CAT_REVIEW),
]

# 技能执行 prompt 模板（id -> 成果标题 + 指令 + 是否需检索 RAG）
_SKILL_PROMPTS = {
    "ppt": ("PPT 大纲", "请基于材料生成一份方案汇报 PPT 大纲：逐页给出页标题与该页要点（每页 2-4 条）。", True),
    "review": ("方案评审意见", "请基于材料对当前方案做评审：分『优点 / 待改进问题 / 具体建议』三段，逐条说明依据。", True),
    "task": ("任务安排", "请基于材料拆解可执行任务清单：每条含『任务 / 建议负责角色 / 优先级 / 建议时序』。", True),
    "compete": ("竞品分析", "请从材料与知识库中找出类比项目，做对标分析：可比维度、各自做法、对本项目的借鉴。", True),
    "concept": ("概念激发", "请基于项目材料提出 3-5 个有设计叙事、空间原型与形式灵感的概念方向。", True),
    "compare": ("方案比选", "请基于材料对多个方案进行设计比选，从概念、空间、形式三个维度给出推荐。", True),
    "meeting": ("会议纪要要点", "请基于材料提炼会议要点：背景、关键结论、甲方诉求、风险分歧、下一步。", True),
    "img": ("生图提示词", "请基于材料生成若干条 AI 生图提示词（中英各一版），用于方案意向图；仅输出提示词文本，不生成图片。", False),
    # ── 本期新增(文本类走结构化/文本路径) ──
    "massing": ("体量推敲", "请基于场地与任务书推敲建筑体量：给出 2-3 个体量/退台策略，各说明形态逻辑、与场地关系、可深化方向。", True),
    "caselib": ("案例库检索", "请从知识库与材料中检索同类型学的标杆案例：每个给项目特征、可借鉴策略、与本项目的相关度。", True),
    "condition": ("规划条件解读", "请把规划条件（红线/容积率/限高/退线/日照等）拆解成对设计的具体约束与机会，逐条说明影响。", True),
    "writer": ("投标文本", "请基于材料起草投标技术标设计说明：分设计立意/总体布局/示范区体验/技术亮点，语气贴合评审、术语规范。", True),
    "brief": ("汇报提纲", "请基于材料生成甲方汇报提纲（15 分钟版），按『先共识、再亮点、后承诺』组织，每段标时长与要点。", True),
    "poster": ("一页纸海报", "请把方案核心信息浓缩成一页纸要点结构：一句话主张 + 3-5 个支撑亮点 + 关键数据，适合汇报封面。", True),
    "slang": ("甲方黑话翻译", "请把甲方原话/诉求翻译成设计语言：逐条给『原话 / 真实含义 / 对设计的影响 / 建议动作』。", True),
    "director": ("效果图导演", "请为本方案规划效果图出图脚本：列人视/鸟瞰/序列等关键镜头，每个标视角、画面重点、想传达的卖点。", True),
    "shotlist": ("视角脚本", "请列出投标效果图的关键视角清单：每条含视角类型（人视/鸟瞰/半鸟瞰/序列）、取景对象、画面意图。", True),
    "judge": ("节点督办", "请基于材料梳理在推节点与里程碑：挑出最该处理的风险点，按『不处理的代价』排序，给催办建议。", True),
    "norm": ("规范审查", "请对方案做规范合规自检：日照/间距/消防疏散/退线/容积率等逐条给 通过/需关注/不符 + 依据（不臆造规范条文）。", True),
    "flow": ("定义工作流", "请为本项目搭一条『设计—出图—评审』标准流水线：分步骤，每步标负责人 / AI 可接管部分 / 产出。", True),
    # ── 本期新增(视觉类走生图链路) ──
    "facade": ("立面生成", "退台公建化住宅立面，精致材质与线脚，黄昏自然光，写实建筑摄影风格", False),
    "moodboard": ("风格参考板", "高端住宅风格氛围参考，材质与光影意向，写实建筑表现", False),
}

# 视觉类技能:复用生图链路(image_gen),与 img 同路。其 _SKILL_PROMPTS 指令作为生图提示词的偏置。
_IMAGE_SKILLS = {"img", "facade", "moodboard"}


# ── 斜杠命令映射(对话框打 /xxx 直接触发技能;别名→skill_id)──
_COMMANDS = [
    ("/ppt", "ppt", "PPT 大纲", False),
    ("/会议纪要", "meeting", "会议纪要", False),
    ("/纪要", "meeting", "会议纪要", False),
    ("/评审", "review", "方案评审", False),
    ("/任务", "task", "任务安排", False),
    ("/竞品", "compete", "竞品分析", False),
    ("/概念", "concept", "概念激发", False),
    ("/比选", "compare", "方案比选", False),
    ("/出图", "img", "AI 生图(需确认)", True),
]
_CMD_MAP = {c: (sid, confirm) for c, sid, _label, confirm in _COMMANDS}


def _gen_image_prompt(cfg: models.AppSetting, project_name: str, material_ctx: str, user_ask: str) -> str:
    """据『用户想要的画面』扩写英文生图提示词;用户意图为主、项目材料兜底。供 /出图 草案 + 直接出图复用。"""
    user_ask = (user_ask or "").strip()
    if user_ask:
        gen_user = (
            f"用户想要的画面:{user_ask}\n"
            + (f"项目背景(仅兜底参考,不要喧宾夺主):{material_ctx[:800]}\n" if material_ctx else "")
            + "把『用户想要的画面』扩写成一条高质量英文 AI 生图提示词,写实建筑效果图;"
            "以用户意图为主、项目背景只作补充;突出风格/构图/材质/光线/视角;只输出英文提示词,不要解释。"
        )
    else:
        gen_user = (
            f"{material_ctx or ('项目：' + project_name)}\n\n"
            "请为本建筑项目生成一条用于 AI 出『方案意向图/效果图』的英文生图提示词,"
            "突出建筑风格、立面材质、光线氛围、视角,写实风格;只输出英文提示词,不要解释。"
        )
    return llm.chat_completion(
        [{"role": "user", "content": gen_user}],
        api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
    ).strip()


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


def _save_result(db: Session, project_id: int, session_id: int, out: schemas.SkillRunOut) -> int:
    """把成果落库(成功/失败都落,状态如实),返回 result_id 供归档回查。"""
    row = models.SkillResult(
        project_id=project_id, session_id=session_id or 0, skill_id=out.skill_id,
        title=out.title, status=out.status, content=out.content, output_json=out.output_json,
        image_path=out.image_url, image_model=out.image_model,
        sources_json=safe_json.dumps_safe([s.model_dump() for s in out.sources]),
        model=out.model, error_message=out.error_message,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


# ── 方案评审预检(P1-D):成果提交前对照固定清单逐条预检 ──
@router.get("/api/review-checklist", response_model=schemas.ReviewChecklistOut)
def get_review_checklist() -> schemas.ReviewChecklistOut:
    """返回内置评审检查清单模板(只读,不触发执行)。"""
    return schemas.ReviewChecklistOut(
        items=[schemas.ChecklistItemDef(**c) for c in review_checklist.CHECKLIST]
    )


def _save_precheck(db: Session, project_id: int, source_result_id: int, out: schemas.ReviewPrecheckOut) -> int:
    row = models.ReviewPrecheck(
        project_id=project_id, source_result_id=source_result_id or 0,
        status=out.status, result_json=out.output_json, content=out.content,
        model=out.model, error_message=out.error_message,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


@router.post("/api/projects/{project_id}/review-precheck", response_model=schemas.ReviewPrecheckOut)
def run_review_precheck(
    project_id: int, payload: schemas.ReviewPrecheckIn, db: Session = Depends(get_db)
) -> schemas.ReviewPrecheckOut:
    """对项目(可带 source_result_id 指向某条 review 成果)跑一遍清单,逐条 pass|warn|fail|na+依据。"""
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(404, "项目不存在")
    cfg = _settings(db)
    if not cfg.deepseek_api_key:
        out = schemas.ReviewPrecheckOut(status="not_configured", content=NOT_CONFIGURED_MSG)
        out.precheck_id = _save_precheck(db, project_id, payload.source_result_id, out)
        return out

    # 被预检的方案/评审意见(指向某条 review 成果时一并喂入)
    review_content = ""
    if payload.source_result_id:
        src = db.get(models.SkillResult, payload.source_result_id)
        if src is not None and src.project_id == project_id:
            review_content = src.content or ""

    query = f"{project.name} 方案评审 预检 {payload.input}".strip()
    material = analysis.gather_material(db, project_id, query=query, top_k=5)
    if material.empty and not review_content.strip():
        out = schemas.ReviewPrecheckOut(status="no_material", content=NO_MATERIAL_MSG)
        out.precheck_id = _save_precheck(db, project_id, payload.source_result_id, out)
        return out

    sysp, userp, fmt = review_checklist.build_precheck_prompt(project.name, material.context or "", review_content)
    try:
        answer = llm.chat_completion(
            [{"role": "system", "content": sysp}, {"role": "user", "content": userp}],
            api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
            response_format=fmt, timeout=90.0,
        )
    except llm.LLMError as e:
        out = schemas.ReviewPrecheckOut(status="error", content="AI 调用失败，请稍后重试或检查设置。",
                                        model=cfg.deepseek_model, error_message=str(e))
        out.precheck_id = _save_precheck(db, project_id, payload.source_result_id, out)
        return out

    result = review_checklist.normalize_precheck(review_checklist.parse_json_loose(answer))
    out = schemas.ReviewPrecheckOut(
        status="ok",
        items=[schemas.ReviewPrecheckItemOut(**it) for it in result["items"]],
        summary=result["summary"],
        content=review_checklist.precheck_to_markdown(result),
        output_json=safe_json.dumps_safe(result),
        source_result_id=payload.source_result_id,
        model=cfg.deepseek_model,
    )
    out.precheck_id = _save_precheck(db, project_id, payload.source_result_id, out)
    return out


# ── 任务安排成果 → 任务看板(P0-A 延伸):把结构化任务一键落成可追踪 TeamAssignment ──
@router.post(
    "/api/projects/{project_id}/skill-results/{result_id}/to-assignments",
    response_model=schemas.SkillTasksToBoardOut,
)
def task_result_to_assignments(
    project_id: int, result_id: int, db: Session = Depends(get_db)
) -> schemas.SkillTasksToBoardOut:
    """把『任务安排』成果的结构化任务一键落到项目任务看板(team_assignments)。

    幂等:按 source_result_id 查重,同一成果重复落不重复建。owner 名精确匹配在册成员则关联 member_id。
    非 task 成果→400;无结构化任务(回落了纯文本)→如实返回 empty,不伪造任务。"""
    if db.get(models.Project, project_id) is None:
        raise HTTPException(404, "项目不存在")
    src = db.get(models.SkillResult, result_id)
    if src is None or src.project_id != project_id:
        raise HTTPException(404, "成果不存在")
    if src.skill_id != "task":
        raise HTTPException(400, "只有『任务安排』成果能落任务看板")

    existing = (
        db.query(models.TeamAssignment)
        .filter(models.TeamAssignment.source_result_id == result_id)
        .count()
    )
    if existing:
        return schemas.SkillTasksToBoardOut(
            status="already", created=0, existing=existing,
            message=f"该成果已落过 {existing} 条任务到看板，未重复创建。",
        )

    data = safe_json.loads_or(src.output_json, {})
    tasks = data.get("tasks") if isinstance(data, dict) else None
    if not isinstance(tasks, list) or not tasks:
        return schemas.SkillTasksToBoardOut(
            status="empty", created=0, existing=0,
            message="该成果没有结构化任务（可能回落了纯文本），无法落看板（不伪造）。",
        )

    members = {
        m.name: m.id
        for m in db.query(models.TeamMember).filter(models.TeamMember.status == "active").all()
    }
    created = 0
    for t in tasks:
        if not isinstance(t, dict):
            continue
        title = str(t.get("task", "")).strip()
        if not title:
            continue
        owner = str(t.get("owner", "")).strip()
        db.add(models.TeamAssignment(
            project_id=project_id, member_id=members.get(owner),
            task_title=title[:300], owner_name=owner[:100],
            due=str(t.get("due", "")).strip()[:40],
            status="todo", source_result_id=result_id,
        ))
        created += 1
    if created:
        db.commit()
    return schemas.SkillTasksToBoardOut(
        status="ok", created=created, existing=0,
        message=f"已落 {created} 条任务到任务看板。",
    )


def _moa_skill_markdown(title: str, checklist: dict) -> str:
    """把 MoA JSON 压成现有成果卡可读 markdown；完整 JSON 放 output_json。"""
    lines = [f"# {title} · 设计委员会", ""]
    if checklist.get("one_sentence_review"):
        lines += [f"核心判断：{checklist.get('one_sentence_review')}", ""]
    if checklist.get("overall_score") is not None:
        risk = checklist.get("risk_level", "—")
        rate = checklist.get("pass_rate")
        rate_text = f" · 通过度 {round(float(rate) * 100)}%" if isinstance(rate, (int, float)) else ""
        lines += [f"总分：{checklist.get('overall_score')}/100 · 设计成熟度风险：{risk}{rate_text}", ""]
    highlights = checklist.get("highlights") or []
    if highlights:
        lines.append("## 设计亮点")
        for h in highlights[:5]:
            lines.append(f"- {h.get('aspect', '亮点')}：{h.get('note', '')}")
        lines.append("")
    issues = checklist.get("core_issues") or []
    if issues:
        lines.append("## 核心问题")
        for it in issues[:5]:
            issue = it.get("issue", "")
            impact = it.get("impact", "")
            suggestion = it.get("suggestion", "")
            lines.append(f"- {issue}" + (f"｜影响：{impact}" if impact else "") + (f"｜建议：{suggestion}" if suggestion else ""))
        lines.append("")
    conflicts = checklist.get("conflict_items") or checklist.get("cross_cutting_issues") or []
    if conflicts:
        lines.append("## 跨维度问题")
        for c in conflicts[:4]:
            lines.append(f"- {c.get('issue', '')}：{c.get('resolution', '')}")
        lines.append("")
    steps = checklist.get("next_steps") or []
    if steps:
        lines.append("## 下一步")
        for i, step in enumerate(steps[:6], 1):
            lines.append(f"{i}. {step}")
    if len(lines) <= 2:
        return json.dumps(checklist, ensure_ascii=False, indent=2)
    return "\n".join(lines).strip()


def _preset_key_for_skill(skill_id: str) -> str:
    for key, preset in moa.BUILTIN_MOA_PRESETS.items():
        if skill_id in (preset.applicable_skills or []):
            return key
    return ""


def _run_skill_moa(
    skill_id: str,
    title: str,
    project: models.Project,
    material_ctx: str,
    user_extra: str,
    cfg: models.AppSetting,
) -> Optional[schemas.SkillRunOut]:
    """按 skill_id 找 MoA preset；无 preset 返回 None 让调用方回落单模型。"""
    preset_key = _preset_key_for_skill(skill_id)
    if not preset_key:
        return None
    preset = moa.BUILTIN_MOA_PRESETS[preset_key]
    # 专家要评的「评审材料」= 项目材料(+用户补充);项目名只作背景,避免专家只评到元数据。
    extra = (user_extra or "").strip()
    material_text = (material_ctx or "").strip()
    user_input = (material_text + (f"\n\n用户补充：{extra}" if extra else "")).strip() \
        or f"项目「{project.name}」材料较少，请基于项目名给方向性设计评审。"
    result = moa.run_moa_sync(
        preset_key,
        user_input=user_input,
        project_context=f"项目：{project.name}",
        response_format={"type": "json_object"},
        api_key=cfg.deepseek_api_key,
        base_url=cfg.deepseek_base_url,
    )
    model_label = preset.aggregator.model if preset.aggregator else cfg.deepseek_model
    if not result.success:
        # MoAResult 只有 error_message(无 error/retry_suggestion);兜底返回可读错误,不冒 500。
        return schemas.SkillRunOut(
            skill_id=skill_id,
            status="error",
            title=f"{title} · 设计委员会",
            content=result.error_message or "设计委员会暂时失败，请稍后重试。",
            output_json=safe_json.dumps_safe({
                "success": False,
                "error": result.error_message,
                "retry_suggestion": "主审模型偶发超时/限流，请稍后点「重试」。",
                # 三专家原话/会诊过程不落库
            }),
            model=model_label,
            error_message=result.error_message or "MoA aggregator failed",
        )
    try:
        checklist = json.loads(result.final_output or result.aggregation_output or "{}")
    except Exception:
        checklist = {"parse_error": True, "raw_output": result.final_output or result.aggregation_output}
    return schemas.SkillRunOut(
        skill_id=skill_id,
        status="ok",
        title=f"{title} · 设计委员会",
        content=_moa_skill_markdown(title, checklist),
        output_json=safe_json.dumps_safe({
            "success": True,
            "checklist": checklist,
            "cost": {"total_tokens": result.total_tokens, "total_cost_yuan": result.total_cost_yuan, "total_latency_ms": result.total_latency_ms},
            "preset": preset.name,
            # 三专家原话/会诊过程不落库,只保留最终结论(checklist)
        }),
        model=model_label,
    )


@router.post(
    "/api/projects/{project_id}/skills/{skill_id}/run",
    response_model=schemas.SkillRunOut,
)
def run_skill(
    project_id: int, skill_id: str, payload: schemas.SkillRunIn, db: Session = Depends(get_db)
) -> schemas.SkillRunOut:
    """执行技能 → 成果卡(落库归档,不伪造)。围绕当前项目 + 项目级 RAG（规则 3/9/10）。"""
    out = _run_skill_inner(project_id, skill_id, payload, db)
    out.result_id = _save_result(db, project_id, payload.session_id, out)
    return out


def _run_skill_inner(
    project_id: int, skill_id: str, payload: schemas.SkillRunIn, db: Session
) -> schemas.SkillRunOut:
    """技能执行内核（产 SkillRunOut，不落库）。run_skill / command 复用。"""
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

    # ── 设计委员会模式(P·MoA):mode=moa 且该技能有对应预设 → 多设计委员会;否则回落下方单模型分支 ──
    if payload.mode == "moa" and _preset_key_for_skill(skill_id):
        if needs_rag and material.empty:
            return schemas.SkillRunOut(skill_id=skill_id, status="no_material", title=title, content=NO_MATERIAL_MSG)
        moa_out = _run_skill_moa(skill_id, title, project, material.context or "", payload.input, cfg)
        if moa_out is not None:
            moa_out.sources = sources if needs_rag else []
            return moa_out

    # ── 结构化技能：PPT 大纲 / 会议纪要（json mode + normalizer 兜底 + markdown）──
    if skill_id == "ppt":
        if material.empty:
            return schemas.SkillRunOut(skill_id=skill_id, status="no_material", title=title, content=NO_MATERIAL_MSG)
        n = skill_structured.slide_count_from_input(payload.input)
        sysp, userp, fmt = skill_structured.build_ppt_prompt(
            project.name, material.context or "", payload.input, n, audience=payload.audience
        )
        try:
            answer = llm.chat_completion(
                [{"role": "system", "content": sysp}, {"role": "user", "content": userp}],
                api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
                response_format=fmt, timeout=90.0,
            )
        except llm.LLMError as e:
            return schemas.SkillRunOut(skill_id=skill_id, status="error", title=title,
                                       content="AI 调用失败，请稍后重试或检查设置。", model=cfg.deepseek_model, error_message=str(e))
        result = skill_structured.normalize_ppt(skill_structured.parse_json_loose(answer), n, audience=payload.audience)
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
                response_format=fmt, timeout=90.0,
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

    # ── 生图类技能(img / facade / moodboard):DeepSeek 据材料生成提示词 → APImart 真出图 → 存项目 uploads ──
    if skill_id in _IMAGE_SKILLS:
        # 未配生图 key:如实提示,绝不伪造图(规则 3/10)。文本 key 单独判过。
        if not image_gen.is_configured():
            return schemas.SkillRunOut(skill_id=skill_id, status="not_configured", title=title,
                                       content=image_gen.NOT_CONFIGURED_MSG)
        # 1) 提示词:用户已在轻确认里看过/改过的最终 prompt → 直接用(对齐用户,不再二次扩写);
        #    否则据『用户输入为主、材料兜底』扩写一条;facade/moodboard 用技能指令偏置生图意图。
        if payload.image_prompt.strip():
            prompt = payload.image_prompt.strip()
        else:
            ask = payload.input
            if skill_id != "img" and instruction:
                ask = (instruction + "。" + (payload.input or "")).strip()
            try:
                prompt = _gen_image_prompt(cfg, project.name, material.context or "", ask)
            except llm.LLMError as e:
                return schemas.SkillRunOut(skill_id=skill_id, status="error", title=title,
                                           content="生成提示词失败。", error_message=str(e))
        # 1.5) 图生图参考图:读 ref_asset_ids 字节转 base64 data URI(本机图 APImart 抓不到,必须 base64;最多 4 张)
        ref_urls: list[str] = []
        for aid in (payload.ref_asset_ids or [])[:4]:
            a = db.get(models.FileAsset, aid)
            if a is None or a.project_id != project_id or a.status != "active":
                continue
            try:
                data = uploads.abs_of(a.stored_path).read_bytes()
                m = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png", "webp": "webp", "gif": "gif"}.get((a.ext or "").lower(), "png")
                ref_urls.append(f"data:image/{m};base64," + base64.b64encode(data).decode())
            except Exception:  # noqa: BLE001  单张参考图读失败跳过,不阻断
                continue
        # 2) 真出图(异步制,内部轮询)。带参考图→图生图(image_gen 内部确保用吃参考图的模型,不静默退 t2i)
        res = image_gen.generate_image(prompt, model=payload.model, image_urls=ref_urls or None)
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
        # AI 效果图同步登记为图片资产(asset_type=render)——出图那刻分类 100% 确定,不猜。
        try:
            w, h = image_assets._dims(res.image_bytes)
            thumb = image_assets.make_thumb(res.image_bytes)
            thumb_rel = uploads.save_upload(project_id, f"thumb-AI生图-{res.model}.jpg", thumb).stored_path if thumb else ""
            db.add(models.FileAsset(
                project_id=project_id, source_file_id=0, asset_type="render",
                stored_path=stored.stored_path, thumb_path=thumb_rel, ext=ext,
                caption=((("[图生图] " if ref_urls else "") + (prompt or "AI 效果图")))[:200],
                width=w, height=h, status="active",
            ))
            db.commit()
        except Exception:  # noqa: BLE001  资产登记失败不影响出图成果返回
            db.rollback()
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

    try:
        # 任务安排走差异化结构(任务/负责人/优先级/时序),产物可一键落任务看板;解析无效→回落纯文本(不伪造)。
        if skill_id == "task":
            content, output_json = skill_structured.run_task_structured(
                project_name=project.name, context=material.context, user_extra=payload.input,
                api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
            )
            return schemas.SkillRunOut(
                skill_id=skill_id, status="ok", title=title, content=content,
                output_json=output_json, sources=sources if needs_rag else [], model=cfg.deepseek_model,
            )
        # 需要多视角设计判断的技能可显式走 MoA Lite；默认仍保守使用原单模型结构化链路。
        mode = (payload.mode or "").strip().lower()
        if mode in ("moa", "auto") and moa.get_preset_for_skill(skill_id) is not None:
            out = _run_skill_moa(skill_id, title, project, material.context, payload.input, cfg)
            if out is not None:
                out.sources = sources if needs_rag else []
                return out

        # 判断类技能(方案评审/竞品)走结构化:core/points/actions/questions/detail
        # +文风内嵌;解析无效→回落纯文本(仍 ok,不伪造)。其余技能走普通文本。
        if skill_id in ("review", "compete"):
            content, output_json = structured_judgment.run_structured(
                project_name=project.name, instruction=instruction,
                context=material.context, user_extra=payload.input,
                api_key=cfg.deepseek_api_key, base_url=cfg.deepseek_base_url, model=cfg.deepseek_model,
            )
            return schemas.SkillRunOut(
                skill_id=skill_id, status="ok", title=title, content=content,
                output_json=output_json, sources=sources if needs_rag else [], model=cfg.deepseek_model,
            )
        msgs = []
        if material.context:
            msgs.append({"role": "system", "content": material.context})
        user = f"项目：{project.name}\n\n技能：{title}\n指令：{instruction}"
        if payload.input.strip():
            user += f"\n\n用户补充：{payload.input.strip()}"
        user += "\n\n要求：条理清晰、可执行；如材料不足请明确指出，不要臆测。"
        msgs.append({"role": "user", "content": user})
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


# ── 成果归档:项目维度回查历史成果 ──
@router.get("/api/projects/{project_id}/skill-results", response_model=schemas.SkillResultListOut)
def list_skill_results(project_id: int, db: Session = Depends(get_db)) -> schemas.SkillResultListOut:
    """项目历史成果(按时间倒序),供归档回查——过几天翻出上次做的 PPT/图。"""
    if db.get(models.Project, project_id) is None:
        raise HTTPException(404, "项目不存在")
    rows = (
        db.query(models.SkillResult)
        .filter(models.SkillResult.project_id == project_id)
        .order_by(models.SkillResult.created_at.desc())
        .all()
    )
    return schemas.SkillResultListOut(items=rows, total=len(rows))


@router.get("/api/projects/{project_id}/skill-results/{result_id}", response_model=schemas.SkillResultOut)
def get_skill_result(project_id: int, result_id: int, db: Session = Depends(get_db)) -> schemas.SkillResultOut:
    row = db.get(models.SkillResult, result_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "成果不存在")
    return row


def _ppt_keywords(textval: str) -> set:
    """切关键词:ASCII 词 + CJK 2 字 bigram(与检索分词同口径),供 caption↔slide 匹配。"""
    import re

    s: set = set()
    for ck in re.findall(r"[A-Za-z0-9]+|[一-鿿]+", textval or ""):
        if ck.isascii():
            if len(ck) >= 2:
                s.add(ck.lower())
        else:
            for i in range(len(ck) - 1):
                s.add(ck[i : i + 2])
    return s


def _slide_image_map(db: Session, project_id: int, slides: list) -> dict:
    """据 caption 关键词重叠，把每页匹配到一张项目图片资产(不复用、设阈值)。

    返回 {slide_no: 图片绝对路径}。阈值=3 个关键词重叠才放图，宁缺勿滥(不硬塞无关图)。
    """
    assets = (
        db.query(models.FileAsset)
        .filter(models.FileAsset.project_id == project_id, models.FileAsset.status == "active")
        .all()
    )
    cands = [(a, _ppt_keywords(a.caption)) for a in assets if (a.caption or "").strip()]
    if not cands:
        return {}
    used: set = set()
    out: dict = {}
    for s in slides:
        skw = _ppt_keywords(
            " ".join(
                [str(s.get("title", "")), str(s.get("keyMessage", "")),
                 str(s.get("visualSuggestion", "")), " ".join(s.get("bullets") or [])]
            )
        )
        if not skw:
            continue
        best, best_score = None, 0
        for a, akw in cands:
            if a.id in used:
                continue
            sc = len(skw & akw)
            if sc > best_score:
                best_score, best = sc, a
        if best is not None and best_score >= 3:
            used.add(best.id)
            try:
                out[s.get("no")] = str(uploads.abs_of(best.stored_path))
            except Exception:  # noqa: BLE001
                pass
    return out


@router.get("/api/projects/{project_id}/skill-results/{result_id}/export.pptx", include_in_schema=False)
def export_skill_result_pptx(project_id: int, result_id: int, db: Session = Depends(get_db)):
    """把 PPT 大纲成果渲染成真 .pptx 下载(复用已落库的结构化 output_json)。"""
    from urllib.parse import quote

    from fastapi.responses import Response

    row = db.get(models.SkillResult, result_id)
    if row is None or row.project_id != project_id:
        raise HTTPException(404, "成果不存在")
    if row.skill_id != "ppt":
        raise HTTPException(400, "仅 PPT 大纲成果可导出为 .pptx")
    data = safe_json.loads_or(row.output_json, {})
    if not isinstance(data, dict) or not data.get("slides"):
        raise HTTPException(400, "该成果没有可导出的结构化内容")
    slide_images = _slide_image_map(db, project_id, data.get("slides") or [])
    try:
        pptx_bytes = exporters.build_pptx(data, slide_images)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"PPT 生成失败：{type(e).__name__}: {e}")
    fname = exporters.safe_filename(data.get("title") or "汇报") + ".pptx"
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


# ── 斜杠命令:对话框打 /xxx 直接触发技能 ──
@router.get("/api/skill-commands", response_model=schemas.SkillCommandListOut)
def list_skill_commands() -> schemas.SkillCommandListOut:
    """命令清单(供前端 / 菜单渲染)。"""
    items = [
        schemas.SkillCommandDef(command=c, skill_id=sid, label=label, needs_confirm=confirm)
        for c, sid, label, confirm in _COMMANDS
    ]
    return schemas.SkillCommandListOut(items=items)


@router.post("/api/projects/{project_id}/command", response_model=schemas.SkillCommandOut)
def run_command(project_id: int, payload: schemas.SkillCommandIn, db: Session = Depends(get_db)) -> schemas.SkillCommandOut:
    """解析对话框命令:文本类直跑落库;/出图需轻确认;非命令→走普通对话。"""
    text = (payload.text or "").strip()
    if not text.startswith("/"):
        return schemas.SkillCommandOut(status="not_command")
    head, _, rest = text.partition(" ")
    if head not in _CMD_MAP:
        return schemas.SkillCommandOut(status="not_command", message=f"未知命令：{head}")
    skill_id, needs_confirm = _CMD_MAP[head]
    rest = rest.strip()

    if needs_confirm:  # /出图:不直接跑,先把『真正要用的英文提示词』草案给前端,让用户看/改再确认
        from .. import image_gen
        if not image_gen.is_configured():
            return schemas.SkillCommandOut(status="confirm_image", skill_id=skill_id,
                                           prompt=rest, model=image_gen.DEFAULT_MODEL,
                                           message=image_gen.NOT_CONFIGURED_MSG)
        cfg = _settings(db)
        draft = ""
        if cfg.deepseek_api_key:
            project = db.get(models.Project, project_id)
            material = analysis.gather_material(db, project_id, query=f"{project.name if project else ''} 生图 {rest}", top_k=3)
            try:
                draft = _gen_image_prompt(cfg, project.name if project else "", material.context or "", rest)
            except llm.LLMError:
                draft = rest  # 草案生成失败,回落用户原话,出图时再扩写
        return schemas.SkillCommandOut(status="confirm_image", skill_id=skill_id,
                                       prompt=draft or rest or "(将据当前项目材料自动生成提示词)",
                                       model=payload.model or image_gen.DEFAULT_MODEL)

    # 文本类命令:直接执行 + 落库
    run_in = schemas.SkillRunIn(input=rest, session_id=payload.session_id)
    out = _run_skill_inner(project_id, skill_id, run_in, db)
    out.result_id = _save_result(db, project_id, payload.session_id, out)
    return schemas.SkillCommandOut(status="result", skill_id=skill_id, result=out)

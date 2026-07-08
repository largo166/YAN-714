"""Pydantic v2 请求/响应模型。"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── 项目 ──
class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    status: str = "active"
    city: str = ""
    client: str = ""


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None
    city: Optional[str] = None
    client: Optional[str] = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    current_stage: str = "brief"
    created_at: datetime
    updated_at: datetime


class ProjectListOut(BaseModel):
    items: List[ProjectOut]
    total: int


class ProjectOverviewOut(BaseModel):
    """项目中心 KPI 真实计数（只读聚合，0 是真实值）。"""

    files: int = 0
    meetings: int = 0
    todos: int = 0
    minutes: int = 0
    risks: int = 0
    assets: int = 0
    gaps: int = 0


class ProjectMilestoneOut(BaseModel):
    title: str
    owner: str = ""
    due: str = ""
    urgent: bool = False


class ProjectMilestoneListOut(BaseModel):
    items: List[ProjectMilestoneOut] = []


class ProjectProgressOut(BaseModel):
    pct: int = 0
    next_node: str = ""
    next_due: str = ""


class ProjectRiskOut(BaseModel):
    level: str
    text: str


class ProjectRiskListOut(BaseModel):
    items: List[ProjectRiskOut] = []


class ReusableAssetOut(BaseModel):
    kind: str
    name: str


class ReusableAssetListOut(BaseModel):
    items: List[ReusableAssetOut] = []


class TeamMemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    role: str = ""
    duty: str = ""
    birthday: str = ""
    status: str = "active"


class TeamMemberUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    role: Optional[str] = None
    duty: Optional[str] = None
    birthday: Optional[str] = None
    status: Optional[str] = None


class TeamAssignmentOut(BaseModel):
    task_title: str
    due: str = ""
    project_id: int


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    role: str = ""
    duty: str = ""
    birthday: str = ""
    assignments: List[TeamAssignmentOut] = []


class TeamMemberListOut(BaseModel):
    items: List[TeamMemberOut] = []


class TeamAssignmentCreate(BaseModel):
    member_id: int
    task_title: str = Field(min_length=1, max_length=300)
    due: str = ""


class TeamAssignmentCreateOut(TeamAssignmentOut):
    id: int
    member_id: int
    created_at: datetime


class AgentOut(BaseModel):
    id: str
    name: str
    role: str = ""
    duty: str = ""
    output: str = ""
    status: str = "plan"


class AgentListOut(BaseModel):
    items: List[AgentOut] = []


class AgentRunIn(BaseModel):
    project_id: int
    input: str = ""


class SkillSourceOut(BaseModel):
    """RAG 结构化出处（技能/Agent 执行共用）。"""

    kind: str
    ref_id: int
    title: str
    snippet: str
    engine: str = ""


class AgentRunOut(BaseModel):
    agent_id: str
    status: str  # ok|plan|not_configured|no_material|error
    title: str = ""
    content: str = ""
    sources: List[SkillSourceOut] = []
    model: str = ""
    error_message: str = ""


class BroadcastCreate(BaseModel):
    text: str = Field(min_length=1)


class BroadcastOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    created_at: datetime


class BroadcastListOut(BaseModel):
    items: List[BroadcastOut] = []


class TickerItemOut(BaseModel):
    kind: str
    text: str


class TickerListOut(BaseModel):
    items: List[TickerItemOut] = []


class BossDashboardOut(BaseModel):
    active_projects: int = 0
    near_delivery: int = 0
    high_risks: int = 0
    ai_usage_week: int = 0


class WorkloadItemOut(BaseModel):
    name: str
    pct: int
    level: str


class WorkloadListOut(BaseModel):
    items: List[WorkloadItemOut] = []


class AiUsageItemOut(BaseModel):
    capability: str
    count: int


class AiUsageListOut(BaseModel):
    items: List[AiUsageItemOut] = []


class NotConfiguredListOut(BaseModel):
    status: str = "not_configured"
    items: List[dict] = []


class KnowledgeStatsOut(BaseModel):
    documents: int = 0
    indexed: int = 0
    chunks: int = 0
    cjk_chunks: int = 0
    engine: str = "like"


class ResultSendChannelOut(BaseModel):
    channel: str
    configured: bool
    label: str


class ResultSendChannelsOut(BaseModel):
    items: List[ResultSendChannelOut] = []


class ResultSendPreviewIn(BaseModel):
    content: str = Field(min_length=1)
    channel: str


class ResultSendPreviewOut(BaseModel):
    status: str
    rendered: str = ""
    channel: str = ""


class ReflowOut(BaseModel):
    status: str
    reflowed_count: int


# ── 共创营地：内置技能目录（运行时独立，仅展示，执行链路后续接入）──
class SkillOut(BaseModel):
    id: str
    title: str
    icon: str = ""
    source: str = ""
    example: str = ""
    status: str = "待命"
    category: str = ""   # 共创营地技能库 5 分类(概念与方案/竞品与研究/文本与汇报/出图与表现/审查与合规)
    color: str = ""      # 分类色(#7c5cff 等),供前端分类渲染


class SkillListOut(BaseModel):
    items: List[SkillOut]
    total: int


class SkillRunIn(BaseModel):
    input: str = ""  # 可选用户补充指令
    model: str = ""  # 生图技能选模型(gpt-image-1-official | gemini-3-pro-image-preview);其它技能忽略
    mode: str = ""  # ai 调度模式: ""/single=单模型; moa=设计委员会; auto=复杂技能自动选 MoA
    session_id: int = 0  # 关联的对话会话(成果归档用;0=无)
    image_prompt: str = ""  # 生图:用户已确认的最终英文提示词。非空则直接用,不再二次扩写(/出图 轻确认对齐)
    audience: str = ""  # PPT 分口径档位:client|exec|review(空=不分口径);其它技能忽略(P1-F)
    ref_asset_ids: List[int] = []  # 图生图参考资产 id(生图技能用其字节作参考图;空=文生图)


class SkillTasksToBoardOut(BaseModel):
    status: str          # ok|already|empty
    created: int = 0     # 本次新建任务数
    existing: int = 0    # already 时既有任务数
    message: str = ""


class SkillRunOut(BaseModel):
    skill_id: str
    status: str  # ok|not_configured|no_material|error
    title: str = ""
    content: str = ""           # markdown(向后兼容现有成果卡纯文本渲染)
    output_json: str = ""       # 结构化结果 JSON 字符串(PPT/会议纪要;供前端「复制 JSON」)
    image_url: str = ""         # 生图:本地 stored 路径(已下载存 uploads,不过期)
    image_model: str = ""       # 生图实际使用的模型
    result_id: int = 0          # 落库成果 id(供归档回查;0=未落库)
    sources: List[SkillSourceOut] = []
    model: str = ""
    error_message: str = ""


class SkillResultOut(BaseModel):
    """归档成果(项目维度回查)。"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    skill_id: str
    title: str = ""
    status: str
    content: str = ""
    output_json: str = ""
    image_path: str = ""        # 项目内 stored_path(前端用 /image?path= 取图)
    image_model: str = ""
    model: str = ""
    error_message: str = ""
    created_at: datetime


class SkillResultListOut(BaseModel):
    items: List[SkillResultOut]
    total: int


# ── 方案评审预检(P1-D) ──
class ChecklistItemDef(BaseModel):
    id: str
    label: str
    dim: str = ""
    hint: str = ""


class ReviewChecklistOut(BaseModel):
    items: List[ChecklistItemDef]


class ReviewPrecheckIn(BaseModel):
    source_result_id: int = 0  # 指向某条 review 成果(0=直接对项目材料预检)
    input: str = ""            # 用户补充重点(可选)


class ReviewPrecheckItemOut(BaseModel):
    id: str
    label: str = ""
    dim: str = ""
    status: str  # pass|warn|fail|na
    finding: str = ""
    evidence: str = ""


class ReviewPrecheckOut(BaseModel):
    status: str  # ok|not_configured|no_material|error
    items: List[ReviewPrecheckItemOut] = []
    summary: dict = {}
    content: str = ""
    output_json: str = ""
    source_result_id: int = 0
    precheck_id: int = 0
    model: str = ""
    error_message: str = ""


# ── 斜杠命令(对话框打 /xxx 触发技能) ──
class SkillCommandIn(BaseModel):
    text: str = ""           # 用户输入,如 "/ppt 做6页"
    session_id: int = 0
    model: str = ""          # /出图 确认后带模型


class SkillCommandOut(BaseModel):
    """命令解析结果:
    - status=result:文本类命令已直接执行,result 是成果(落库)
    - status=confirm_image:/出图,需前端轻确认(prompt+model),确认后再调 img run
    - status=not_command:非命令(无/或未知),前端走普通对话
    """
    status: str
    skill_id: str = ""
    result: Optional[SkillRunOut] = None
    prompt: str = ""         # confirm_image:将用于生图的提示词草案
    model: str = ""          # confirm_image:默认模型
    message: str = ""


class SkillCommandDef(BaseModel):
    command: str             # 如 "/ppt"
    skill_id: str
    label: str
    needs_confirm: bool = False


class SkillCommandListOut(BaseModel):
    items: List[SkillCommandDef]


# ── 设置 ──
class SettingsOut(BaseModel):
    deepseek_api_key_set: bool
    deepseek_base_url: str
    deepseek_model: str
    theme: str
    repository_root_path: str = ""        # 受管资料库(仓库)根;""=未配置→回退 uploads
    repository_configured: bool = False   # 便于前端显示「已配置/未配置」徽章


class SettingsUpdate(BaseModel):
    deepseek_api_key: Optional[str] = None
    deepseek_base_url: Optional[str] = None
    deepseek_model: Optional[str] = None
    theme: Optional[str] = None
    repository_root_path: Optional[str] = None  # 非空=校验后配置;""=解除配置


# ── 管理口令门槛(P1-6):本机口令防同屏误入,非网络级安全 ──
class AdminPasswordIn(BaseModel):
    password: str


class AdminStatusOut(BaseModel):
    configured: bool


class AdminLoginOut(BaseModel):
    ok: bool


# ── 4B: 聊天 ──
class ChatSessionCreate(BaseModel):
    title: str = "新会话"


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    role: str
    content: str
    status: str
    error_message: str
    created_at: datetime


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime
    updated_at: datetime


class ChatSessionDetailOut(ChatSessionOut):
    messages: List[ChatMessageOut] = []


class ChatSessionListOut(BaseModel):
    items: List[ChatSessionOut]
    total: int


class SendMessageIn(BaseModel):
    message: str = Field(min_length=1)
    use_knowledge: bool = False
    knowledge_query: Optional[str] = None
    project_id: Optional[int] = None  # 项目级检索范围（E1）；None=全库
    top_k: int = 5
    # 随消息附带的项目文件 id：把这些文件的解析全文注入上下文（共创营地"上传后直接问"用）
    attached_file_ids: List[int] = []


class KnowledgeHitOut(BaseModel):
    document_id: int
    title: str
    snippet: str
    score: float
    matched_text: str
    engine: str
    locator: str = ""  # 出处定位：第N页 / 第N张幻灯片（无则空）
    # ── P0 检索第一生产力(2026-07-08):展示字段纯加法,旧调用方零感知 ──
    file_type: str = ""       # 文件格式(pdf/docx/pptx/png…,来自 KnowledgeDocument.file_type)
    doc_type: str = ""        # 资料类型(任务书/会议纪要/方案文本/图纸/案例/方法/其他)
    updated_at: str = ""      # 最近更新(ISO 字符串,供结果卡显示日期)
    project_id: int = 0       # 归属项目(经 ProjectFile.indexed_doc_id 反查;无关联=0)
    project_name: str = ""    # 归属项目名(前端结果卡直显,免二次查询)
    project_file_id: int = 0  # 关联项目文件(reveal 用;无关联=0 → 前端不显示打开按钮)


class SendMessageOut(BaseModel):
    """一次发送返回 user + assistant 两条消息 + 可选检索结果。"""

    user_message: ChatMessageOut
    assistant_message: ChatMessageOut
    knowledge_hits: List[KnowledgeHitOut] = []
    model: str
    ai_configured: bool
    cognition_injected: bool = False  # 本次是否注入了该项目【已确认】结构化认知（上下文供给协议）


# ── 4B: 知识库 ──
class KnowledgeDocCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content_text: str = ""
    source_path: str = ""
    file_type: str = "text"
    tags: str = ""
    type: str = ""
    description: str = ""
    resource: str = ""


class KnowledgeDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_path: str
    content_text: str
    file_type: str
    tags: str
    type: str = ""
    description: str = ""
    resource: str = ""
    created_at: datetime
    updated_at: datetime


class KnowledgeDocListItem(BaseModel):
    """列表项不带全文，省流量。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_path: str
    file_type: str
    tags: str
    type: str = ""
    description: str = ""
    resource: str = ""
    created_at: datetime
    updated_at: datetime


class GenerateMetadataOut(BaseModel):
    """AI 按需生成元数据结果（不伪造：无 key/无正文不写库）。"""

    status: str  # ok|not_configured|no_material|error
    document_id: int
    description: str = ""
    type: str = ""
    model: str = ""
    message: str = ""
    error_message: str = ""


class KnowledgeDocListOut(BaseModel):
    items: List[KnowledgeDocListItem]
    total: int


class KnowledgeSearchIn(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = 5
    project_id: Optional[int] = None  # 项目级检索范围（E1）；None=全库
    doc_type: Optional[str] = None  # P0:资料类型过滤(VALID_TYPES 之一);None=不过滤(命中层过滤,纯加法)


class KnowledgeSearchOut(BaseModel):
    query: str
    engine: str
    hits: List[KnowledgeHitOut]


# ── 文件系统:只读列目录(目录选择弹窗) ──
class DirEntryOut(BaseModel):
    name: str
    abs_path: str
    is_dir: bool
    ext: str = ""
    supported: bool = False   # 文件可被整理链路解析(文件夹恒 False)
    is_symlink: bool = False


class DirListOut(BaseModel):
    accessible: bool
    level: str = "dir"        # "drives"=盘符层 | "dir"=目录层
    path: str = ""
    parent: Optional[str] = None
    drives: List[str] = []
    shortcuts: List[DirEntryOut] = []  # 盘符层的常用位置快捷入口(桌面/文档/下载/主目录)
    items: List[DirEntryOut] = []
    error: str = ""


# ── 4D: 项目文件 ──
class ProjectFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    filename: str
    stored_path: str
    storage_root: str = ""   # 落盘时受管根(空=回退 uploads);供溯源/还原
    file_type: str
    size: int
    parse_status: str
    parse_error: str
    indexed_doc_id: int
    status: str
    created_at: datetime
    updated_at: datetime


class ProjectFileDetailOut(ProjectFileOut):
    """详情/预览附带抽取文本。"""

    content_text: str


class ProjectFileListOut(BaseModel):
    items: List[ProjectFileOut]
    total: int


class IndexFileOut(BaseModel):
    """回流入库结果。"""

    file_id: int
    document_id: int
    title: str


# batch-ingest 批量接入 schema 已删除(2026-07,前端零调用,管线一并移除;git 历史可找回)


# ── 4D: AI 研判 ──
ANALYSIS_TASKS = ("overview", "difficulty", "demand", "plan", "report")


class AnalysisSourceOut(BaseModel):
    """结构化出处（结论与出处分离，可溯源）。"""

    kind: str  # "knowledge" | "project_file"
    ref_id: int  # knowledge doc_id 或 project_file_id
    title: str
    snippet: str
    engine: str  # "fts5" | "like" | "file"


class AnalyzeIn(BaseModel):
    task: str = Field(description="overview|difficulty|demand|plan|report")
    top_k: int = 5
    force: bool = False   # True=强制重跑;默认 False=已有成功结果则直接返回(秒回不重跑 LLM)


class ProjectAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    task: str
    status: str
    content: str
    output_json: str = ""   # 结构化判断 JSON(core/points/actions/questions/detail);回落纯文本时为空
    sources: List[AnalysisSourceOut] = []
    model: str
    error_message: str
    created_at: datetime


class ProjectAnalysisListOut(BaseModel):
    items: List[ProjectAnalysisOut]
    total: int


# ── 项目结构化认知（ProjectCognition Schema 规格 v1.0）──
SCHEMA_VERSION = "1.0"

# 范围约束（规格 1.4，写入每个 module 的 scope_constraint，防跑偏）
SCOPE_CONSTRAINT = (
    "仅建筑方案前期。排除：城市规划/控规/修详规/施工图/结构/给排水/暖通/强弱电/"
    "幕墙深化/景观深化/室内深化/造价招采/施工组织/BIM深化。"
    "若内容跨前后期，只保留对方案前期判断有帮助的部分。"
)

# 任务书 A1 字段描述表（规格 A1，17 字段）。每项：key/label/type/required/nullable/extractable/source_type
# extractable 四档（规格 1.3）：high=明文事实 / medium=事实需归类 / low=判断只给草案 / manual_only=核心判断不填值给引导问题
BRIEF_FIELD_SPECS = [
    {"key": "project_name", "label": "项目名称", "type": "string", "required": True, "nullable": False, "extractable": "high", "source_type": "doc"},
    {"key": "building_type", "label": "建筑类型", "type": "string", "required": True, "nullable": False, "extractable": "high", "source_type": "doc"},
    {"key": "project_phase", "label": "项目阶段", "type": "string", "required": True, "nullable": False, "extractable": "high", "source_type": "doc"},
    {"key": "site_location", "label": "基地位置", "type": "string", "required": True, "nullable": False, "extractable": "high", "source_type": "doc"},
    {"key": "building_scale", "label": "建筑规模", "type": "string", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "land_conditions", "label": "用地条件", "type": "string", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "key_indicators", "label": "容积率/建筑密度/限高/绿地率", "type": "object", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "program_composition", "label": "功能构成", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "client_explicit_goals", "label": "业主显性目标", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "client_implicit_goals", "label": "业主隐性目标", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "user_needs", "label": "使用者需求", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "site_constraints", "label": "场地限制", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "design_conflicts", "label": "设计矛盾", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "must_solve_problems", "label": "必须解决的问题", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "value_creation_problems", "label": "可创造价值的问题", "type": "array", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
    {"key": "questions_to_clarify", "label": "前期需追问的问题", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "design_entry_point", "label": "方案切入点", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# manual_only 字段的人工引导问题（规格 1.3：不填值，只输出引导问题）
MANUAL_GUIDE = {
    "value_creation_problems": "在满足任务书之外，这个项目最值得设计去创造价值的点是什么？（请人工判断填写）",
    "design_entry_point": "你打算从哪个角度切入这个方案？（核心设计立场，请人工填写）",
}

# ── A2-A8 其余项目认知模块字段表（规格 A2-A8，复用 A1 的 extractable 四档分档）──
# 设计原则：事实(high/medium)可从材料抽并带出处；判断(low)只给草案+推理依据、禁 confirmed；
# 核心立场(manual_only)不填值、只给引导问题。全部受 SCOPE_CONSTRAINT 约束（仅方案前期）。

# A2 场地研究 site_research
SITE_RESEARCH_FIELD_SPECS = [
    {"key": "site_boundary", "label": "用地边界与范围", "type": "string", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "topography", "label": "地形地貌/高差", "type": "string", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "surroundings", "label": "周边环境/界面", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "access_traffic", "label": "出入口与交通条件", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "orientation_climate", "label": "朝向/日照/气候", "type": "string", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "regulatory_limits", "label": "退线/限高/规划控制", "type": "object", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "site_opportunities", "label": "场地机会点", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "site_challenges", "label": "场地挑战/制约", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "site_strategy_stance", "label": "场地策略立场", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# A3 使用者与功能 user_program
USER_PROGRAM_FIELD_SPECS = [
    {"key": "user_groups", "label": "使用者人群", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "program_list", "label": "功能/房间构成", "type": "array", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "area_allocation", "label": "面积分配/配比", "type": "object", "required": False, "nullable": True, "extractable": "high", "source_type": "doc"},
    {"key": "usage_scenarios", "label": "使用场景/行为", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "adjacency_needs", "label": "功能邻接关系", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "latent_needs", "label": "潜在/未言明需求", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "program_priority_stance", "label": "功能取舍立场", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# A4 概念生成 design_concept
DESIGN_CONCEPT_FIELD_SPECS = [
    {"key": "core_problem", "label": "核心设计问题", "type": "string", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "concept_keywords", "label": "概念关键词", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "design_intent", "label": "设计意图/主张", "type": "string", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "precedents", "label": "可借鉴的案例/原型", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "concept_stance", "label": "概念立场（一句话主张）", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# A5 动线与体验 circulation_experience
CIRCULATION_FIELD_SPECS = [
    {"key": "entry_sequence", "label": "入口与到达序列", "type": "string", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "main_circulation", "label": "主要动线组织", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "flow_separation", "label": "人/车/货流线分离", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "experience_nodes", "label": "体验节点/场所", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "circulation_stance", "label": "动线体验立场", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# A6 平剖立方向 plan_section_facade
PSF_FIELD_SPECS = [
    {"key": "plan_strategy", "label": "平面策略", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "section_strategy", "label": "剖面/竖向策略", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "facade_strategy", "label": "立面/形象方向", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "material_intent", "label": "材料/质感倾向", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "psf_stance", "label": "平剖立整体立场", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# A7 方案比选 scheme_comparison
SCHEME_COMPARISON_FIELD_SPECS = [
    {"key": "options", "label": "比选方案列表", "type": "array", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "comparison_criteria", "label": "比选维度/标准", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "tradeoffs", "label": "各方案优劣权衡", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "recommendation_stance", "label": "推荐方案与理由", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# A8 项目复盘 project_review
PROJECT_REVIEW_FIELD_SPECS = [
    {"key": "outcome_summary", "label": "成果概述", "type": "string", "required": False, "nullable": True, "extractable": "medium", "source_type": "doc"},
    {"key": "what_worked", "label": "做得好的点", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "what_to_improve", "label": "可改进点", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "reusable_assets", "label": "可复用资产线索", "type": "array", "required": False, "nullable": True, "extractable": "low", "source_type": "inference"},
    {"key": "lesson_stance", "label": "核心经验沉淀", "type": "string", "required": False, "nullable": True, "extractable": "manual_only", "source_type": "manual"},
]

# 模块 → 字段表 / 引导问题 / 抽取提示 注册表（驱动通用 extract）。
# brief 复用既有 BRIEF_FIELD_SPECS/MANUAL_GUIDE，保证 A1 行为不变。
MODULE_FIELD_SPECS = {
    "brief": BRIEF_FIELD_SPECS,
    "site_research": SITE_RESEARCH_FIELD_SPECS,
    "user_program": USER_PROGRAM_FIELD_SPECS,
    "design_concept": DESIGN_CONCEPT_FIELD_SPECS,
    "circulation_experience": CIRCULATION_FIELD_SPECS,
    "plan_section_facade": PSF_FIELD_SPECS,
    "scheme_comparison": SCHEME_COMPARISON_FIELD_SPECS,
    "project_review": PROJECT_REVIEW_FIELD_SPECS,
}

MODULE_GUIDES = {
    "brief": MANUAL_GUIDE,
    "site_research": {"site_strategy_stance": "面对这个场地，你的核心策略立场是什么？（如何回应地形/界面/约束，请人工填写）"},
    "user_program": {"program_priority_stance": "功能发生冲突时，你优先保谁、牺牲谁？（功能取舍立场，请人工填写）"},
    "design_concept": {"concept_stance": "用一句话说出这个方案的核心主张是什么？（概念立场，请人工填写）"},
    "circulation_experience": {"circulation_stance": "你希望使用者在这个建筑里经历怎样的空间序列？（动线体验立场，请人工填写）"},
    "plan_section_facade": {"psf_stance": "平面/剖面/立面三者中，哪个是你这个方案的主导抓手？（整体立场，请人工填写）"},
    "scheme_comparison": {"recommendation_stance": "综合权衡后你推荐哪个方案，核心理由是什么？（请人工填写）"},
    "project_review": {"lesson_stance": "这个项目最值得沉淀、下次能复用的一条经验是什么？（请人工填写）"},
}

# 每模块的抽取查询提示（gather_material 检索用）+ summary 提示词
MODULE_QUERY_HINT = {
    "brief": "任务书 设计任务 项目定位",
    "site_research": "场地 用地 地形 周边 交通 朝向 退线 限高",
    "user_program": "使用者 人群 功能 房间 面积 配比 使用场景",
    "design_concept": "概念 核心问题 设计主张 意图 案例 原型",
    "circulation_experience": "动线 流线 入口 到达 体验 序列 节点",
    "plan_section_facade": "平面 剖面 立面 竖向 形象 材料 质感",
    "scheme_comparison": "方案 比选 对比 优劣 权衡 推荐",
    "project_review": "复盘 成果 总结 经验 改进 可复用",
}


def module_field_specs(module: str) -> list:
    """取某模块的字段描述表；未知模块返回空表（调用方据此 404）。"""
    return MODULE_FIELD_SPECS.get(module, [])


def module_guides(module: str) -> dict:
    return MODULE_GUIDES.get(module, {})

# A 类项目认知 module（规格 A1-A8）。A1-A8 均已实现 extractable 分档抽取（阶段2）。
COGNITION_MODULES = {
    "brief": {"label": "任务书", "implemented": True},
    "site_research": {"label": "场地研究", "implemented": True},
    "user_program": {"label": "使用者与功能", "implemented": True},
    "design_concept": {"label": "概念生成", "implemented": True},
    "circulation_experience": {"label": "动线与体验", "implemented": True},
    "plan_section_facade": {"label": "平剖立方向", "implemented": True},
    "scheme_comparison": {"label": "方案比选", "implemented": True},
    "project_review": {"label": "项目复盘", "implemented": True},
}

# B 类跨项目复用库（规格 B1-B6）。落 KnowledgeDocument（type 字段携带类别），全局可检索复用。
# 只有【已确认】的项目认知/成果才能沉淀进来（人工审定后，不伪造），并带源项目/源模块出处。
CROSS_PROJECT_TYPES = (
    "case_study", "spatial_strategy", "massing_operation",
    "representation", "typology", "design_method",
)

# B1-B6 类别 → 中文标签
CROSS_PROJECT_LABELS = {
    "case_study": "案例库",
    "spatial_strategy": "空间策略",
    "massing_operation": "体量操作",
    "representation": "图面表达",
    "typology": "类型学",
    "design_method": "设计方法",
}

# 工作流状态机节点（规格 D，16 节点）。本刀只定义不驱动。
STAGE_NODES = [
    {"stage": "brief", "label": "任务书", "cognition_module": "brief", "upstream_required": []},
    {"stage": "conditions", "label": "条件梳理", "cognition_module": "", "upstream_required": ["brief"]},
    {"stage": "site", "label": "场地研究", "cognition_module": "site_research", "upstream_required": ["brief"]},
    {"stage": "user_program", "label": "使用者功能", "cognition_module": "user_program", "upstream_required": ["brief"]},
    {"stage": "cases", "label": "案例研究", "cognition_module": "", "upstream_required": []},
    {"stage": "core_problem", "label": "核心问题", "cognition_module": "", "upstream_required": ["brief", "site"]},
    {"stage": "concept", "label": "概念生成", "cognition_module": "design_concept", "upstream_required": ["core_problem"]},
    {"stage": "spatial", "label": "空间策略", "cognition_module": "", "upstream_required": ["concept"]},
    {"stage": "massing", "label": "体量推演", "cognition_module": "", "upstream_required": ["concept"]},
    {"stage": "circulation", "label": "动线组织", "cognition_module": "circulation_experience", "upstream_required": ["concept"]},
    {"stage": "psf", "label": "平剖立方向", "cognition_module": "plan_section_facade", "upstream_required": ["concept"]},
    {"stage": "comparison", "label": "方案比选", "cognition_module": "scheme_comparison", "upstream_required": ["psf"]},
    {"stage": "representation", "label": "图面表达", "cognition_module": "", "upstream_required": ["comparison"]},
    {"stage": "narrative", "label": "汇报叙事", "cognition_module": "", "upstream_required": ["comparison"]},
    {"stage": "review", "label": "评图反馈", "cognition_module": "", "upstream_required": []},
    {"stage": "archive", "label": "复盘入库", "cognition_module": "project_review", "upstream_required": []},
]


class CognitionFieldSource(BaseModel):
    """单字段出处（规格 1.2）。"""
    type: str = "manual"           # doc | inference | manual
    doc_ids: List[int] = []
    based_on: List[str] = []       # type=inference 时引用的字段 key
    doc_location: str = ""


class CognitionField(BaseModel):
    """单字段记录（规格 1.2）。"""
    key: str
    label: str
    type: str
    extractable: str
    value: object = None
    status: str = "draft"          # draft | confirmed | empty
    source: CognitionFieldSource = CognitionFieldSource()
    confidence: Optional[float] = None  # manual_only 恒为 null
    guide: str = ""                # manual_only 的引导问题


class CognitionSourceOut(BaseModel):
    kind: str
    ref_id: int
    title: str
    snippet: str
    engine: str = ""


class ProjectCognitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    module: str
    module_label: str = ""
    schema_version: str = SCHEMA_VERSION
    fields: List[CognitionField] = []   # 字段记录数组（规格 1.2）
    summary_md: str = ""
    status: str                          # 记录态 draft|confirmed
    module_status: str = "draft"         # draft|confirmed|partial|empty
    version: int = 1
    sources: List[CognitionSourceOut] = []
    model: str = ""
    quality_warnings: List[dict] = []    # 隐形质检层(阶段6)：防假认知 advisory 警告,不阻断
    created_at: datetime
    updated_at: datetime


class CognitionVersionOut(BaseModel):
    """认知版本快照(阶段6 版本层)。"""
    id: int
    cognition_id: int
    version: int
    summary_md: str = ""
    module_status: str = "draft"
    model: str = ""
    snapshot_reason: str = ""
    fields: List[CognitionField] = []
    created_at: datetime


class CognitionExtractOut(BaseModel):
    """任务书结构化抽取结果（不伪造：无 key/无材料不写库）。"""

    status: str  # ok|not_configured|no_material|error
    cognition: Optional[ProjectCognitionOut] = None
    message: str = ""
    error_message: str = ""


# ── B 类跨项目复用库（规格 B1-B6，阶段3）──
class CrossProjectTypeOut(BaseModel):
    type: str
    label: str
    count: int = 0


class PrecipitateIn(BaseModel):
    """把【已确认】项目认知沉淀进跨项目库（不伪造：只接受 confirmed 字段/已审定内容）。"""
    project_id: int
    cog_id: int                      # 源 ProjectCognition 行
    cross_type: str                  # B1-B6 类别之一
    title: Optional[str] = None      # 不给则用「项目名·模块标签」


class CrossProjectItemOut(BaseModel):
    document_id: int
    title: str
    cross_type: str
    label: str
    description: str = ""
    resource: str = ""               # 出处（源项目/源模块）
    snippet: str = ""


class PrecipitateOut(BaseModel):
    status: str                      # ok|empty（项目/认知/类别不存在走 HTTP 404，不在此枚举内）
    item: Optional[CrossProjectItemOut] = None
    message: str = ""


# ── 工作流状态机驱动（规格 D，阶段4）──
class StageNodeOut(BaseModel):
    stage: str
    label: str
    cognition_module: str = ""       # 背后的 A 类认知 module；纯过程节点为 ""
    kind: str = "process"            # cognition | process
    upstream_required: List[str] = []
    done: bool = False               # cognition 节点:有已确认认知则 True;process 节点恒 False(不靠认知判定)


class StageSuggestionOut(BaseModel):
    stage: str
    label: str
    cognition_module: str
    ready: bool                      # 认知类上游都已完成,可推进
    blocked_by: List[str] = []       # 卡住它的未完成认知类上游 stage


class StageProgressOut(BaseModel):
    project_id: int
    current_stage: str
    done_count: int                  # 已完成的 stage 数(含 process? 否——只数 cognition done)
    total_cognition_stages: int      # 有 cognition_module 的节点总数
    nodes: List[StageNodeOut] = []
    suggestions: List[StageSuggestionOut] = []


# ── 回流契约（成果回写数据基地，阶段5）──
class ReflowResultOut(BaseModel):
    """把人工确认的成果(研判/纪要)回写数据基地的结果。"""
    status: str                      # ok|already|not_confirmed|empty（成果不存在走 HTTP 404）
    document_id: int = 0             # 回流生成/已存在的 knowledge_documents.id
    title: str = ""
    resource: str = ""               # 出处（源项目/源成果）
    message: str = ""


# ── 会议纪要 ──
class TranscriptSegment(BaseModel):
    text: str
    speaker_key: str = "speaker-1"
    start_ms: int = 0
    end_ms: int = 0


class MeetingCreateIn(BaseModel):
    title: str = "未命名会议"
    meeting_date: str = ""
    attendees: str = ""  # 参会人（纯文本）
    raw_text: str = ""  # 贴会议记录文本


class MinuteFromFileIn(BaseModel):
    """共创营地"生成这份文件的会议纪要"：用已上传项目文件原文建会议并出正式纪要。"""
    file_id: int
    title: Optional[str] = None  # 不传则用 "纪要-{文件名}"


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    meeting_date: str
    attendees: str = ""
    transcript_source: str
    status: str
    provider: str = ""
    tencent_meeting_code: str = ""
    tencent_join_url: str = ""
    tencent_start_time: str = ""
    tencent_end_time: str = ""
    tencent_status: str = ""
    created_at: datetime
    updated_at: datetime


class MeetingDetailOut(MeetingOut):
    raw_text: str
    tencent_meeting_id: str = ""
    segments: List[TranscriptSegment] = []


class TencentCreateIn(BaseModel):
    confirm: bool = False  # 二次确认才创建真实会议


class TencentSyncOut(BaseModel):
    status: str  # ok|not_configured|provider_unavailable|no_recording|transcript_pending
    minutes: str = ""
    transcript: str = ""
    message: str = ""


class MeetingListOut(BaseModel):
    items: List[MeetingOut]
    total: int


class DemandItem(BaseModel):
    """一条诉求转译，锚定原话+时间点（红线）。"""

    statement: str        # 转译后的诉求
    quote: str = ""       # 锚定的转写原话
    time: str = ""        # 时间点（mm:ss）


class TodoItem(BaseModel):
    text: str
    owner: str = ""
    due: str = ""


class MeetingMinuteOut(BaseModel):
    id: int
    meeting_id: int
    gen_status: str  # ok|not_configured|no_material|error
    summary: List[str] = []
    core_items: List[str] = []
    demand_internal: List[DemandItem] = []  # 对内研判版
    demand_external: List[DemandItem] = []  # 对外纪要版
    decisions: List[str] = []
    todos: List[TodoItem] = []
    review_status: str  # draft|confirmed
    reflowed: bool = False
    model: str
    error_message: str
    created_at: datetime


# ── staging 收料单（检查点① 铁条2：选文件→只读盘出分组/统计/去重预览，不落库不拷贝）──
class StagingFileOut(BaseModel):
    """收料单里的单个文件（只读盘扫描出，尚未入库）。"""
    abs_path: str
    name: str
    ext: str
    size: int
    supported: bool          # 能否被解析链接入（不支持的类型如实标）
    already_indexed: bool     # 是否已在库（同名同大小；content_hash 去重等 0023 后升级）


class StagingGroupOut(BaseModel):
    """按来源文件夹分组的一组文件。"""
    source_dir: str           # 该组来源文件夹绝对路径
    project_hint: str         # 建议项目名（文件夹名）
    project_id: int = 0       # 若该来源文件夹已建过项目则为其 id（0=尚未建）
    warn_reason: str = ""     # 名字软警示（编号前缀/通用词），前端标黄不拦；空=无警示
    files: List[StagingFileOut] = []


class StagingOut(BaseModel):
    """收料单：分组 + 汇总统计 + 去重计数。"""
    groups: List[StagingGroupOut] = []
    total_files: int = 0
    supported_files: int = 0
    already_indexed: int = 0             # 已在库的文件数（标灰）
    type_stats: dict[str, int] = {}      # 扩展名 → 计数
    skipped_unsupported: int = 0
    # A 语义（2026-07-07）：
    selection_mode: str = "single"       # multi=选中父目录已按一级子目录拆成多项目 / single=单项目
    loose_files: int = 0                 # 父目录直属散落文件数（不归入任何项目，本次不入库；前端提示不静默）
    error: str = ""


class StagingIn(BaseModel):
    """选取的绝对路径列表（文件或文件夹混合）；文件夹递归展开。"""
    paths: List[str] = []


class IngestStartOut(BaseModel):
    """启动入库 job 的返回。"""
    job_id: str

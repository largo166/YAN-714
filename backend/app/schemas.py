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


class SkillListOut(BaseModel):
    items: List[SkillOut]
    total: int


class SkillRunIn(BaseModel):
    input: str = ""  # 可选用户补充指令


class SkillRunOut(BaseModel):
    skill_id: str
    status: str  # ok|not_configured|no_material|error
    title: str = ""
    content: str = ""
    sources: List[SkillSourceOut] = []
    model: str = ""
    error_message: str = ""


# ── 设置 ──
class SettingsOut(BaseModel):
    deepseek_api_key_set: bool
    deepseek_base_url: str
    deepseek_model: str
    theme: str


class SettingsUpdate(BaseModel):
    deepseek_api_key: Optional[str] = None
    deepseek_base_url: Optional[str] = None
    deepseek_model: Optional[str] = None
    theme: Optional[str] = None


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


class KnowledgeHitOut(BaseModel):
    document_id: int
    title: str
    snippet: str
    score: float
    matched_text: str
    engine: str


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


class KnowledgeSearchOut(BaseModel):
    query: str
    engine: str
    hits: List[KnowledgeHitOut]


# ── 4D: 项目文件 ──
class ProjectFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    filename: str
    stored_path: str
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


class BatchIngestRequest(BaseModel):
    root_path: str = Field(min_length=1)


class BatchIngestFileOut(BaseModel):
    path: str
    size: int
    ext: str


class BatchIngestProjectPreviewOut(BaseModel):
    project_name: str
    path: str
    supported_count: int
    unsupported_count: int
    files: List[BatchIngestFileOut] = []
    unsupported: List[BatchIngestFileOut] = []


class BatchIngestPreviewOut(BaseModel):
    accessible: bool
    root: str = ""
    error: str = ""
    total_projects: int = 0
    total_supported: int = 0
    total_unsupported: int = 0
    projects: List[BatchIngestProjectPreviewOut] = []


class BatchIngestImportRequest(BatchIngestRequest):
    project_names: Optional[List[str]] = None
    index_to_knowledge: bool = True


class BatchIngestProjectImportOut(BaseModel):
    project_id: int
    project_name: str
    copied: int = 0
    indexed: int = 0
    failed: int = 0
    skipped_existing: int = 0


class BatchIngestImportOut(BaseModel):
    status: str
    root: str
    total_projects: int = 0
    copied: int = 0
    indexed: int = 0
    failed: int = 0
    skipped_existing: int = 0
    projects: List[BatchIngestProjectImportOut] = []


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


class ProjectAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    task: str
    status: str
    content: str
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

# A 类项目认知 module（规格 A1-A8）。brief 本刀实现，其余只占位 schema、不实现抽取。
COGNITION_MODULES = {
    "brief": {"label": "任务书", "implemented": True},
    "site_research": {"label": "场地研究", "implemented": False},
    "user_program": {"label": "使用者与功能", "implemented": False},
    "design_concept": {"label": "概念生成", "implemented": False},
    "circulation_experience": {"label": "动线与体验", "implemented": False},
    "plan_section_facade": {"label": "平剖立方向", "implemented": False},
    "scheme_comparison": {"label": "方案比选", "implemented": False},
    "project_review": {"label": "项目复盘", "implemented": False},
}

# B 类跨项目复用库（规格 B1-B6，落 KnowledgeDocument，本刀不实现，仅登记名）
CROSS_PROJECT_TYPES = (
    "case_study", "spatial_strategy", "massing_operation",
    "representation", "typology", "design_method",
)

# 工作流状态机节点（规格 D，16 节点）。本刀只定义不驱动。
STAGE_NODES = [
    {"stage": "brief", "label": "任务书", "cognition_module": "brief", "upstream_required": []},
    {"stage": "conditions", "label": "条件梳理", "cognition_module": "", "upstream_required": ["brief"]},
    {"stage": "site", "label": "场地研究", "cognition_module": "site_research", "upstream_required": ["brief"]},
    {"stage": "user_program", "label": "使用者功能", "cognition_module": "user_program", "upstream_required": ["brief"]},
    {"stage": "cases", "label": "案例研究", "cognition_module": "", "upstream_required": []},
    {"stage": "core_problem", "label": "核心问题", "cognition_module": "", "upstream_required": ["brief", "site_research"]},
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
    created_at: datetime
    updated_at: datetime


class CognitionExtractOut(BaseModel):
    """任务书结构化抽取结果（不伪造：无 key/无材料不写库）。"""

    status: str  # ok|not_configured|no_material|error
    cognition: Optional[ProjectCognitionOut] = None
    message: str = ""
    error_message: str = ""


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

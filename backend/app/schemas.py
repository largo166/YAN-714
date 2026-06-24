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


# ── 4B: 知识库 ──
class KnowledgeDocCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content_text: str = ""
    source_path: str = ""
    file_type: str = "text"
    tags: str = ""


class KnowledgeDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    source_path: str
    content_text: str
    file_type: str
    tags: str
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
    created_at: datetime
    updated_at: datetime


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

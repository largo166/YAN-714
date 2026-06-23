"""Pydantic v2 请求/响应模型。"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── 项目 ──
class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    status: str = "active"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[str] = None


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
    model: str
    error_message: str
    created_at: datetime

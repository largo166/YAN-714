"""ORM 模型。"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.utcnow()


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="active", nullable=False)
    city: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    client: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class TeamMember(Base):
    __tablename__ = "team_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    duty: Mapped[str] = mapped_column(Text, default="", nullable=False)
    birthday: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class TeamAssignment(Base):
    __tablename__ = "team_assignments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    member_id: Mapped[int] = mapped_column(
        ForeignKey("team_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_title: Mapped[str] = mapped_column(String(300), nullable=False)
    due: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class Broadcast(Base):
    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class AppSetting(Base):
    """单行设置表（id 固定为 1）。"""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deepseek_api_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    deepseek_base_url: Mapped[str] = mapped_column(
        String(300), default="https://api.deepseek.com", nullable=False
    )
    deepseek_model: Mapped[str] = mapped_column(String(100), default="deepseek-chat", nullable=False)
    theme: Mapped[str] = mapped_column(String(20), default="light", nullable=False)
    workspace_path: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


# ── Phase 4B: AI 对话 ──
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), default="新会话", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user / assistant / system
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ok", nullable=False)  # ok / not_configured / error
    error_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    session: Mapped["ChatSession"] = relationship(back_populates="messages")


# ── Phase 4B: 知识库 ──
class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    source_path: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    content_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    file_type: Mapped[str] = mapped_column(String(40), default="text", nullable=False)
    tags: Mapped[str] = mapped_column(String(300), default="", nullable=False)  # 逗号分隔
    # ── 知识元数据层（feat/knowledge-metadata，借鉴 OKF 规范）──
    type: Mapped[str] = mapped_column(String(40), default="", nullable=False)  # 规则推断枚举
    description: Mapped[str] = mapped_column(String(500), default="", nullable=False)  # 一句话摘要（AI 按需生成）
    resource: Mapped[str] = mapped_column(String(500), default="", nullable=False)  # 真实出处
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


# ── Phase 4D: 项目文件上传/解析 ──
class ProjectFile(Base):
    """项目上传文件（我方副本，落 backend/data/uploads/{project_id}/）。"""

    __tablename__ = "project_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)  # 净化后文件名
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)  # 相对 uploads 根
    file_type: Mapped[str] = mapped_column(String(40), default="", nullable=False)  # 扩展名
    size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # 解析状态：pending / ok / empty / unsupported / failed
    parse_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    parse_error: Mapped[str] = mapped_column(Text, default="", nullable=False)
    content_text: Mapped[str] = mapped_column(Text, default="", nullable=False)  # 抽取文本
    # 回流后指向 knowledge_documents.id（未入库则为 0）
    indexed_doc_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # active / trashed（软删，永不硬删）
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


# ── Phase 4D: AI 研判 ──
class ProjectAnalysis(Base):
    """一次研判结果（结论与结构化出处分离存储，便于人工审定）。"""

    __tablename__ = "project_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 任务：overview / difficulty / demand / plan / report
    task: Mapped[str] = mapped_column(String(30), nullable=False)
    # ok / not_configured / no_material / error
    status: Mapped[str] = mapped_column(String(20), default="ok", nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)  # 研判正文
    sources_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 结构化出处
    model: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    error_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


# ── 会议纪要（五段式 + 内外双版）──
class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="未命名会议", nullable=False)
    meeting_date: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, default="", nullable=False)  # 转写原文
    # 带时间点的转写分段（ASR 产物或贴文本切分）：[{text,speakerKey,startMs,endMs}]
    segments_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    transcript_source: Mapped[str] = mapped_column(String(40), default="text", nullable=False)  # text|asr
    attendees: Mapped[str] = mapped_column(Text, default="", nullable=False)  # 参会人（纯文本，逗号/换行分隔）
    status: Mapped[str] = mapped_column(String(20), default="created", nullable=False)
    # ── 腾讯会议 provider（可选；未配则空）──
    provider: Mapped[str] = mapped_column(String(40), default="", nullable=False)  # ""|tencent
    tencent_meeting_id: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    tencent_meeting_code: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    tencent_join_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    tencent_start_time: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    tencent_end_time: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    tencent_status: Mapped[str] = mapped_column(String(30), default="", nullable=False)  # created|cancelled|...
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )


class MeetingMinute(Base):
    """一次五段式纪要生成结果。诉求转译分内/外两版（红线）。"""

    __tablename__ = "meeting_minutes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # ok / not_configured / no_material / error
    gen_status: Mapped[str] = mapped_column(String(20), default="ok", nullable=False)
    # 五段（均存 JSON 文本，safe_json 读写）
    summary_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 会议纪要要点
    core_items_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 核心事项
    demand_internal_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 诉求转译·对内研判
    demand_external_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 诉求转译·对外纪要
    decisions_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 决议
    todos_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # 待办
    # draft（AI 草案）/ confirmed（人工审定）
    review_status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    reflowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    error_message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

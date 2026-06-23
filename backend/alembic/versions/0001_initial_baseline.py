"""initial baseline: projects / app_settings / chat_sessions / chat_messages / knowledge_documents

P1 迁移基线。对应 app/models.py 的 5 张 ORM 表（与现有 dev 库结构一致）。
FTS 虚表 knowledge_documents_fts* 不在此迁移内，由 retrieval.ensure_fts 维护。

对【已有数据的真实库】：用 `alembic stamp 0001_initial_baseline` 标记基线，不重建、不动数据。
对【全新空库】：`alembic upgrade head` 会按本脚本建齐 5 表。

Revision ID: 0001_initial_baseline
Revises:
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing = set(insp.get_table_names())

    if "projects" not in existing:
        op.create_table(
            "projects",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if "app_settings" not in existing:
        op.create_table(
            "app_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("deepseek_api_key", sa.String(length=255), nullable=False, server_default=""),
            sa.Column("deepseek_base_url", sa.String(length=300), nullable=False, server_default="https://api.deepseek.com"),
            sa.Column("deepseek_model", sa.String(length=100), nullable=False, server_default="deepseek-chat"),
            sa.Column("theme", sa.String(length=20), nullable=False, server_default="light"),
            sa.Column("workspace_path", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if "chat_sessions" not in existing:
        op.create_table(
            "chat_sessions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("title", sa.String(length=200), nullable=False, server_default="新会话"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if "chat_messages" not in existing:
        op.create_table(
            "chat_messages",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("session_id", sa.Integer(), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=30), nullable=False, server_default="ok"),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])

    if "knowledge_documents" not in existing:
        op.create_table(
            "knowledge_documents",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("title", sa.String(length=300), nullable=False),
            sa.Column("source_path", sa.String(length=500), nullable=False, server_default=""),
            sa.Column("content_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("file_type", sa.String(length=40), nullable=False, server_default="text"),
            sa.Column("tags", sa.String(length=300), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("knowledge_documents")
    op.drop_index("ix_chat_messages_session_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("app_settings")
    op.drop_table("projects")

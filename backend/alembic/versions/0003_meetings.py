"""add meetings and meeting_minutes (meeting minutes phase)

ASCII-only comments. Idempotent, reversible.

Revision ID: 0003_meetings
Revises: 0002_project_files_analyses
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0003_meetings"
down_revision = "0002_project_files_analyses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(sa.inspect(op.get_bind()).get_table_names())

    if "meetings" not in existing:
        op.create_table(
            "meetings",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(length=200), nullable=False, server_default="未命名会议"),
            sa.Column("meeting_date", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("raw_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("segments_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("transcript_source", sa.String(length=40), nullable=False, server_default="text"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="created"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_meetings_project_id", "meetings", ["project_id"])

    if "meeting_minutes" not in existing:
        op.create_table(
            "meeting_minutes",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("meeting_id", sa.Integer(), sa.ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False),
            sa.Column("gen_status", sa.String(length=20), nullable=False, server_default="ok"),
            sa.Column("summary_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("core_items_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("demand_internal_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("demand_external_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("decisions_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("todos_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("review_status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("model", sa.String(length=100), nullable=False, server_default=""),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_meeting_minutes_meeting_id", "meeting_minutes", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_minutes_meeting_id", table_name="meeting_minutes")
    op.drop_table("meeting_minutes")
    op.drop_index("ix_meetings_project_id", table_name="meetings")
    op.drop_table("meetings")

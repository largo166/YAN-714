"""add project_files and project_analyses (Phase 4D)

Adds two project-scoped tables for file upload/parse and AI analysis.
Idempotent (if-not-exists) and reversible. ASCII-only comments (P1 GBK lesson).

Revision ID: 0002_project_files_analyses
Revises: 0001_initial_baseline
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_project_files_analyses"
down_revision = "0001_initial_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = set(sa.inspect(bind).get_table_names())

    if "project_files" not in existing:
        op.create_table(
            "project_files",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("filename", sa.String(length=255), nullable=False),
            sa.Column("stored_path", sa.String(length=500), nullable=False),
            sa.Column("file_type", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("parse_status", sa.String(length=20), nullable=False, server_default="pending"),
            sa.Column("parse_error", sa.Text(), nullable=False, server_default=""),
            sa.Column("content_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("indexed_doc_id", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_project_files_project_id", "project_files", ["project_id"])

    if "project_analyses" not in existing:
        op.create_table(
            "project_analyses",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("task", sa.String(length=30), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="ok"),
            sa.Column("content", sa.Text(), nullable=False, server_default=""),
            sa.Column("sources_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("model", sa.String(length=100), nullable=False, server_default=""),
            sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_project_analyses_project_id", "project_analyses", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_analyses_project_id", table_name="project_analyses")
    op.drop_table("project_analyses")
    op.drop_index("ix_project_files_project_id", table_name="project_files")
    op.drop_table("project_files")

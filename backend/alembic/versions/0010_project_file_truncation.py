"""add truncation metadata to project_files (truncated_at_page/total_pages)

为 ok_truncated 状态如实记录「正文停在第N页/共M页」,注入 RAG 时标注截断、不伪造全文。

Revision ID: 0010_project_file_truncation
Revises: 0009_cognition_schema_upgrade
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_project_file_truncation"
down_revision = "0009_cognition_schema_upgrade"
branch_labels = None
depends_on = None

_COLS = (
    ("truncated_at_page", sa.Integer(), "0"),
    ("total_pages", sa.Integer(), "0"),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_files" in set(inspector.get_table_names()):
        existing = {c["name"] for c in inspector.get_columns("project_files")}
        with op.batch_alter_table("project_files") as batch:
            for name, coltype, default in _COLS:
                if name not in existing:
                    batch.add_column(sa.Column(name, coltype, nullable=False, server_default=default))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_files" in set(inspector.get_table_names()):
        existing = {c["name"] for c in inspector.get_columns("project_files")}
        with op.batch_alter_table("project_files") as batch:
            for name, _t, _d in reversed(_COLS):
                if name in existing:
                    batch.drop_column(name)

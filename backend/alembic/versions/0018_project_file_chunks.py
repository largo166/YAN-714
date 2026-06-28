"""add project_files.content_chunks_json (PDF 按页 / PPTX 按片分块溯源)

让出处精确到页:解析时按页/片产出 chunk 存这里,检索命中后据命中词定位到具体页/片。

Revision ID: 0018_project_file_chunks
Revises: 0017_file_assets
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0018_project_file_chunks"
down_revision = "0017_file_assets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("project_files")}
    if "content_chunks_json" not in cols:
        op.add_column(
            "project_files",
            sa.Column("content_chunks_json", sa.Text(), nullable=False, server_default=""),
        )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("project_files")}
    if "content_chunks_json" in cols:
        op.drop_column("project_files", "content_chunks_json")

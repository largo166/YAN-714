"""create project_cognition_versions (版本层·阶段6)

认知重抽前的旧状态快照,append-only 审计轨,不丢工作历史。

Revision ID: 0012_cognition_versions
Revises: 0011_analysis_reflow
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0012_cognition_versions"
down_revision = "0011_analysis_reflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "project_cognition_versions" in set(inspector.get_table_names()):
        return
    op.create_table(
        "project_cognition_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("cognition_id", sa.Integer(),
                  sa.ForeignKey("project_cognitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fields_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("summary_md", sa.Text(), nullable=False, server_default=""),
        sa.Column("module_status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("model", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("snapshot_reason", sa.String(length=40), nullable=False, server_default="re-extract"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_project_cognition_versions_cognition_id",
                    "project_cognition_versions", ["cognition_id"])


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "project_cognition_versions" not in set(inspector.get_table_names()):
        return
    op.drop_index("ix_project_cognition_versions_cognition_id", table_name="project_cognition_versions")
    op.drop_table("project_cognition_versions")

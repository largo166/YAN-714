"""add skill_results table (技能/命令成果落库,供归档回查)

成果原来只在内存、刷新即丢——此表补全持久化。成功/失败都落(状态如实)。

Revision ID: 0015_skill_results
Revises: 0014_repository_root
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa


revision = "0015_skill_results"
down_revision = "0014_repository_root"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "skill_results" in set(insp.get_table_names()):
        return
    op.create_table(
        "skill_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), nullable=False, index=True),
        sa.Column("session_id", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skill_id", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="ok"),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("output_json", sa.Text(), nullable=False, server_default=""),
        sa.Column("image_path", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("image_model", sa.String(length=80), nullable=False, server_default=""),
        sa.Column("sources_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("model", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "skill_results" in set(insp.get_table_names()):
        op.drop_table("skill_results")

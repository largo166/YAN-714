"""add project_cognitions table and projects.current_stage

Revision ID: 0008_project_cognition
Revises: 0007_knowledge_metadata
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0008_project_cognition"
down_revision = "0007_knowledge_metadata"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "projects" in tables:
        existing = {c["name"] for c in inspector.get_columns("projects")}
        if "current_stage" not in existing:
            with op.batch_alter_table("projects") as batch:
                batch.add_column(
                    sa.Column("current_stage", sa.String(40), nullable=False, server_default="brief")
                )

    if "project_cognitions" not in tables:
        op.create_table(
            "project_cognitions",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("module", sa.String(length=40), nullable=False),
            sa.Column("fields_json", sa.Text(), nullable=False, server_default="{}"),
            sa.Column("summary_md", sa.Text(), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("sources_json", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("model", sa.String(length=100), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_project_cognitions_project_id", "project_cognitions", ["project_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "project_cognitions" in tables:
        op.drop_index("ix_project_cognitions_project_id", table_name="project_cognitions")
        op.drop_table("project_cognitions")

    if "projects" in tables:
        existing = {c["name"] for c in inspector.get_columns("projects")}
        if "current_stage" in existing:
            with op.batch_alter_table("projects") as batch:
                batch.drop_column("current_stage")

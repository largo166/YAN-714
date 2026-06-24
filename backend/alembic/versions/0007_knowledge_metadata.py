"""add knowledge metadata fields (type/description/resource)

Revision ID: 0007_knowledge_metadata
Revises: 0006_result_reflow_team_assignments
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0007_knowledge_metadata"
down_revision = "0006_result_reflow_team_assignments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "knowledge_documents" in set(inspector.get_table_names()):
        existing = {c["name"] for c in inspector.get_columns("knowledge_documents")}
        with op.batch_alter_table("knowledge_documents") as batch:
            if "type" not in existing:
                batch.add_column(
                    sa.Column("type", sa.String(length=40), nullable=False, server_default="")
                )
            if "description" not in existing:
                batch.add_column(
                    sa.Column("description", sa.String(length=500), nullable=False, server_default="")
                )
            if "resource" not in existing:
                batch.add_column(
                    sa.Column("resource", sa.String(length=500), nullable=False, server_default="")
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "knowledge_documents" in set(inspector.get_table_names()):
        existing = {c["name"] for c in inspector.get_columns("knowledge_documents")}
        with op.batch_alter_table("knowledge_documents") as batch:
            for col in ("resource", "description", "type"):
                if col in existing:
                    batch.drop_column(col)

"""add source_path to projects (受管来源文件夹,批量整理去重/重整用)

Revision ID: 0013_project_source_path
Revises: 0012_cognition_versions
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0013_project_source_path"
down_revision = "0012_cognition_versions"
branch_labels = None
depends_on = None

_COLS = (("source_path", sa.String(length=500), ""),)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "projects" not in set(inspector.get_table_names()):
        return
    existing = {c["name"] for c in inspector.get_columns("projects")}
    with op.batch_alter_table("projects") as batch:
        for name, coltype, default in _COLS:
            if name not in existing:
                batch.add_column(sa.Column(name, coltype, nullable=False, server_default=default))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "projects" not in set(inspector.get_table_names()):
        return
    existing = {c["name"] for c in inspector.get_columns("projects")}
    with op.batch_alter_table("projects") as batch:
        for name, _t, _d in reversed(_COLS):
            if name in existing:
                batch.drop_column(name)

"""add reflowed_doc_id to project_analyses + meeting_minutes (回流契约·阶段5)

研判/纪要回写数据基地后,指向 knowledge_documents.id(0=未回流),供幂等(确定 id 链,避免标题碰撞)。

Revision ID: 0011_analysis_reflow
Revises: 0010_project_file_truncation
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_analysis_reflow"
down_revision = "0010_project_file_truncation"
branch_labels = None
depends_on = None

# 表 → 要加的列(name, type, server_default)
_TABLES = {
    "project_analyses": [("reflowed_doc_id", sa.Integer(), "0")],
    "meeting_minutes": [("reflowed_doc_id", sa.Integer(), "0")],
}


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, cols in _TABLES.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        with op.batch_alter_table(table) as batch:
            for name, coltype, default in cols:
                if name not in existing:
                    batch.add_column(sa.Column(name, coltype, nullable=False, server_default=default))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, cols in _TABLES.items():
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        with op.batch_alter_table(table) as batch:
            for name, _t, _d in reversed(cols):
                if name in existing:
                    batch.drop_column(name)

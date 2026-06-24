"""add repository_root_path to app_settings + storage_root to project_files (本地仓库)

把「一键整理」目标从硬编码 uploads 扩展为用户可配置的仓库文件夹:
- app_settings.repository_root_path: 仓库根(空=未配置→回退 uploads)。
- project_files.storage_root: 该行落盘时的绝对受管根(空=历史/回退行→视作 uploads 根)。
两列均 server_default=""，旧库升级后行为完全不变(未配置=回退)。

Revision ID: 0014_repository_root
Revises: 0013_project_source_path
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0014_repository_root"
down_revision = "0013_project_source_path"
branch_labels = None
depends_on = None

# (表名, 列名, 类型, server_default)
_ADDS = (
    ("app_settings", "repository_root_path", sa.String(length=500), ""),
    ("project_files", "storage_root", sa.String(length=500), ""),
)


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, name, coltype, default in _ADDS:
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if name in existing:
            continue
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column(name, coltype, nullable=False, server_default=default))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    for table, name, _t, _d in reversed(_ADDS):
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if name not in existing:
            continue
        with op.batch_alter_table(table) as batch:
            batch.drop_column(name)

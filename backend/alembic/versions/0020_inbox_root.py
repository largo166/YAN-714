"""add inbox_root_path to app_settings (收件箱监听 P1-C)

收件箱根:监听此文件夹,新文件自动入库。server_default="" → 旧库升级后未配置=不扫描,
行为不变。init_db 的 create_all 只建缺失表,不会给已存在的 app_settings 补列,故需本迁移。

Revision ID: 0020_inbox_root
Revises: 0019_assignment_status
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0020_inbox_root"
down_revision = "0019_assignment_status"
branch_labels = None
depends_on = None

# (表名, 列名, 类型, server_default)
_ADDS = (
    ("app_settings", "inbox_root_path", sa.String(length=500), ""),
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

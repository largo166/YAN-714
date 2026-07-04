"""app_settings 加 admin_password_hash(P1-6 管理驾驶舱口令门槛)

本机管理口令("salt$pbkdf2" 哈希,空=未设置),让「仅管理员可见」名实相符:
防同屏他人误入,非网络级安全(单机产品,不建会话/令牌体系)。
server_default="" → 旧行=未设置,行为不变。

Revision ID: 0022_admin_passcode
Revises: 0021_assignment_source_result
Create Date: 2026-07-03
"""
from alembic import op
import sqlalchemy as sa


revision = "0022_admin_passcode"
down_revision = "0021_assignment_source_result"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("app_settings")}
    if "admin_password_hash" not in cols:
        with op.batch_alter_table("app_settings") as batch:
            batch.add_column(
                sa.Column("admin_password_hash", sa.String(300), nullable=False, server_default="")
            )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("app_settings")}
    if "admin_password_hash" in cols:
        with op.batch_alter_table("app_settings") as batch:
            batch.drop_column("admin_password_hash")

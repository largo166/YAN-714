"""add tencent and attendees columns to meetings (4E)

ASCII-only. Idempotent add_column, reversible.

Revision ID: 0004_meeting_tencent
Revises: 0003_meetings
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa


revision = "0004_meeting_tencent"
down_revision = "0003_meetings"
branch_labels = None
depends_on = None

_COLS = [
    ("attendees", sa.Text(), ""),
    ("provider", sa.String(length=40), ""),
    ("tencent_meeting_id", sa.String(length=64), ""),
    ("tencent_meeting_code", sa.String(length=40), ""),
    ("tencent_join_url", sa.String(length=500), ""),
    ("tencent_start_time", sa.String(length=40), ""),
    ("tencent_end_time", sa.String(length=40), ""),
    ("tencent_status", sa.String(length=30), ""),
]


def upgrade() -> None:
    bind = op.get_bind()
    if "meetings" not in set(sa.inspect(bind).get_table_names()):
        return
    existing = {c["name"] for c in sa.inspect(bind).get_columns("meetings")}
    with op.batch_alter_table("meetings") as batch:
        for name, type_, default in _COLS:
            if name not in existing:
                batch.add_column(sa.Column(name, type_, nullable=False, server_default=default))


def downgrade() -> None:
    bind = op.get_bind()
    if "meetings" not in set(sa.inspect(bind).get_table_names()):
        return
    existing = {c["name"] for c in sa.inspect(bind).get_columns("meetings")}
    with op.batch_alter_table("meetings") as batch:
        for name, _type, _default in reversed(_COLS):
            if name in existing:
                batch.drop_column(name)

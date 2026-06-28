"""team_assignments 加任务看板字段 + member_id 改可空(P0-A 会议纪要→任务看板闭环)

会议纪要 todo 落成可追踪任务:加 status/owner_name/source_minute_id/done_at;
member_id 改可空(todo 可能只有 owner 名、未匹配到成员)。SQLite 用 batch 重建表。

Revision ID: 0019_assignment_status
Revises: 0018_project_file_chunks
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0019_assignment_status"
down_revision = "0018_project_file_chunks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("team_assignments")}
    with op.batch_alter_table("team_assignments") as batch:
        if "status" not in cols:
            batch.add_column(sa.Column("status", sa.String(length=20), nullable=False, server_default="todo"))
        if "owner_name" not in cols:
            batch.add_column(sa.Column("owner_name", sa.String(length=100), nullable=False, server_default=""))
        if "source_minute_id" not in cols:
            batch.add_column(sa.Column("source_minute_id", sa.Integer(), nullable=False, server_default="0"))
        if "done_at" not in cols:
            batch.add_column(sa.Column("done_at", sa.DateTime(), nullable=True))
        # member_id 改可空（todo 派生任务可无成员）
        batch.alter_column("member_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # 不回退 member_id 可空（避免已有 NULL 行违反 NOT NULL）；仅删新列。
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("team_assignments")}
    with op.batch_alter_table("team_assignments") as batch:
        for c in ("done_at", "source_minute_id", "owner_name", "status"):
            if c in cols:
                batch.drop_column(c)

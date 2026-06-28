"""team_assignments 加 source_result_id(任务安排技能成果落看板:来源溯源 + 幂等键)

任务安排技能卡成果一键落任务看板时,用 source_result_id 标来源成果并做幂等去重
(对齐既有 source_minute_id 设计)。server_default="0" → 旧行=0(非技能卡来源),行为不变。
init_db 的 create_all 只建缺失表,不给已存在的 team_assignments 补列,故需本迁移。

Revision ID: 0021_assignment_source_result
Revises: 0020_inbox_root
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa


revision = "0021_assignment_source_result"
down_revision = "0020_inbox_root"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("team_assignments")}
    if "source_result_id" not in cols:
        with op.batch_alter_table("team_assignments") as batch:
            batch.add_column(
                sa.Column("source_result_id", sa.Integer(), nullable=False, server_default="0")
            )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("team_assignments")}
    if "source_result_id" in cols:
        with op.batch_alter_table("team_assignments") as batch:
            batch.drop_column("source_result_id")

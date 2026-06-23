"""add minute reflow marker and team assignments

Revision ID: 0006_result_reflow_team_assignments
Revises: 0005_team_broadcast_project_chips
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0006_result_reflow_team_assignments"
down_revision = "0005_team_broadcast_project_chips"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "meeting_minutes" in tables:
        existing = {c["name"] for c in inspector.get_columns("meeting_minutes")}
        if "reflowed" not in existing:
            with op.batch_alter_table("meeting_minutes") as batch:
                batch.add_column(
                    sa.Column("reflowed", sa.Boolean(), nullable=False, server_default=sa.false())
                )

    if "team_assignments" not in tables:
        op.create_table(
            "team_assignments",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("member_id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("task_title", sa.String(length=300), nullable=False),
            sa.Column("due", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["member_id"], ["team_members.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_team_assignments_member_id", "team_assignments", ["member_id"])
        op.create_index("ix_team_assignments_project_id", "team_assignments", ["project_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "team_assignments" in tables:
        op.drop_index("ix_team_assignments_project_id", table_name="team_assignments")
        op.drop_index("ix_team_assignments_member_id", table_name="team_assignments")
        op.drop_table("team_assignments")

    if "meeting_minutes" in tables:
        existing = {c["name"] for c in inspector.get_columns("meeting_minutes")}
        if "reflowed" in existing:
            with op.batch_alter_table("meeting_minutes") as batch:
                batch.drop_column("reflowed")

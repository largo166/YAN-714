"""add team members, broadcasts, and project chips

Revision ID: 0005_team_broadcast_project_chips
Revises: 0004_meeting_tencent
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0005_team_broadcast_project_chips"
down_revision = "0004_meeting_tencent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "projects" in tables:
        existing = {c["name"] for c in inspector.get_columns("projects")}
        with op.batch_alter_table("projects") as batch:
            if "city" not in existing:
                batch.add_column(
                    sa.Column("city", sa.String(length=100), nullable=False, server_default="")
                )
            if "client" not in existing:
                batch.add_column(
                    sa.Column("client", sa.String(length=200), nullable=False, server_default="")
                )

    if "team_members" not in tables:
        op.create_table(
            "team_members",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("role", sa.String(length=100), nullable=False, server_default=""),
            sa.Column("duty", sa.Text(), nullable=False, server_default=""),
            sa.Column("birthday", sa.String(length=20), nullable=False, server_default=""),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if "broadcasts" not in tables:
        op.create_table(
            "broadcasts",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "broadcasts" in tables:
        op.drop_table("broadcasts")
    if "team_members" in tables:
        op.drop_table("team_members")

    if "projects" in tables:
        existing = {c["name"] for c in inspector.get_columns("projects")}
        with op.batch_alter_table("projects") as batch:
            if "client" in existing:
                batch.drop_column("client")
            if "city" in existing:
                batch.drop_column("city")

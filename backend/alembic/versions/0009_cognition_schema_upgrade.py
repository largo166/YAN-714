"""upgrade project_cognitions to schema spec v1.0 (module_label/schema_version/scope_constraint/module_status)

Revision ID: 0009_cognition_schema_upgrade
Revises: 0008_project_cognition
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa


revision = "0009_cognition_schema_upgrade"
down_revision = "0008_project_cognition"
branch_labels = None
depends_on = None

_COLS = (
    ("module_label", sa.String(40), ""),
    ("schema_version", sa.String(10), "1.0"),
    ("scope_constraint", sa.Text(), ""),
    ("module_status", sa.String(20), "draft"),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_cognitions" in set(inspector.get_table_names()):
        existing = {c["name"] for c in inspector.get_columns("project_cognitions")}
        with op.batch_alter_table("project_cognitions") as batch:
            for name, coltype, default in _COLS:
                if name not in existing:
                    batch.add_column(sa.Column(name, coltype, nullable=False, server_default=default))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "project_cognitions" in set(inspector.get_table_names()):
        existing = {c["name"] for c in inspector.get_columns("project_cognitions")}
        with op.batch_alter_table("project_cognitions") as batch:
            for name, _t, _d in reversed(_COLS):
                if name in existing:
                    batch.drop_column(name)

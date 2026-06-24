"""add project_analyses.output_json (研判结构化 JSON:core/points/actions/questions/detail)

研判从「纯 markdown 文本」升级为「结构化判断」;结构存 output_json,content 仍存可读
markdown(向后兼容渲染/导出)。回落纯文本时 output_json 为空。可逆。

Revision ID: 0016_analysis_output_json
Revises: 0015_skill_results
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa


revision = "0016_analysis_output_json"
down_revision = "0015_skill_results"
branch_labels = None
depends_on = None


def _has_column(insp, table: str, col: str) -> bool:
    return col in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "project_analyses" not in set(insp.get_table_names()):
        return
    if _has_column(insp, "project_analyses", "output_json"):
        return
    op.add_column(
        "project_analyses",
        sa.Column("output_json", sa.Text(), nullable=False, server_default=""),
    )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "project_analyses" not in set(insp.get_table_names()):
        return
    if _has_column(insp, "project_analyses", "output_json"):
        op.drop_column("project_analyses", "output_json")

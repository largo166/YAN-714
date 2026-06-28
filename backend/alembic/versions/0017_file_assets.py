"""add file_assets table (从项目文件抽出的图片资产:PPT/PDF/Word 嵌入图 + 直接上传图)

一个 ProjectFile 可产出多张图(一等资产),落 uploads/{pid}/_assets/,含缩略图 + 来源定位
(slide_no/page_no)+ caption。为图文混排成果物与图片复用打底。

Revision ID: 0017_file_assets
Revises: 0016_analysis_output_json
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa


revision = "0017_file_assets"
down_revision = "0016_analysis_output_json"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "file_assets" in set(insp.get_table_names()):
        return
    op.create_table(
        "file_assets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), nullable=False, index=True),
        sa.Column("source_file_id", sa.Integer(), nullable=False, server_default="0", index=True),
        sa.Column("asset_type", sa.String(length=30), nullable=False, server_default="image"),
        sa.Column("stored_path", sa.String(length=500), nullable=False),
        sa.Column("thumb_path", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("ext", sa.String(length=12), nullable=False, server_default=""),
        sa.Column("page_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("slide_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("shape_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("caption", sa.Text(), nullable=False, server_default=""),
        sa.Column("width", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("height", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "file_assets" in set(insp.get_table_names()):
        op.drop_table("file_assets")

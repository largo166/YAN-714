"""knowledge_documents 加 design_doc_type + design_type_confirmed(P1-1 资料类型 v2,双轨)

建筑语义轴 16 类(文本/演示/表格/效果图/图纸/模型/会议/汇报/案例/方法/规范/合同/成本/
甲方资料/现场资料/其他)。旧 type 七类列保留不删——双轨读,兼容映射在 doc_type_rules.LEGACY_TYPE_MAP。
存量回填:upgrade 时按映射一次性填 design_doc_type(纯 SQL CASE,不跑规则引擎——
规则推断只对新入库文档生效,存量按旧类映射,不重判不破坏)。

Revision ID: 0023_design_doc_type
Revises: 0022_admin_passcode
Create Date: 2026-07-08
"""
from alembic import op
import sqlalchemy as sa


revision = "0023_design_doc_type"
down_revision = "0022_admin_passcode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("knowledge_documents")}
    if "design_doc_type" not in cols:
        with op.batch_alter_table("knowledge_documents") as batch:
            batch.add_column(sa.Column("design_doc_type", sa.String(40), nullable=False, server_default=""))
    if "design_type_confirmed" not in cols:
        with op.batch_alter_table("knowledge_documents") as batch:
            batch.add_column(sa.Column("design_type_confirmed", sa.Boolean(), nullable=False, server_default="0"))
    # 存量回填:旧七类 → 新16类(写死映射,与 doc_type_rules.LEGACY_TYPE_MAP 同步)
    op.execute(
        """
        UPDATE knowledge_documents SET design_doc_type = CASE type
            WHEN '任务书' THEN '甲方资料'
            WHEN '会议纪要' THEN '会议'
            WHEN '方案文本' THEN '文本'
            WHEN '图纸' THEN '图纸'
            WHEN '案例' THEN '案例'
            WHEN '方法' THEN '方法'
            ELSE '其他'
        END
        WHERE design_doc_type = '' AND type != ''
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("knowledge_documents") as batch:
        batch.drop_column("design_type_confirmed")
        batch.drop_column("design_doc_type")

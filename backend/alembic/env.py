"""Alembic 环境（接入 app 配置，路径无关）。

- URL 取自 app.config.settings.resolved_database_url（与运行时同库），可被环境变量
  DATABASE_URL 覆盖（测试用临时库）。
- target_metadata = app.models 的 Base.metadata（5 张 ORM 表）。
- FTS 虚表（knowledge_documents_fts*）由 retrieval.ensure_fts 维护，不纳入 Alembic
  autogenerate（render_item 跳过），避免迁移误删 FTS。
"""
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# 让 "app" 包可被导入（backend/ 在 sys.path）
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.database import Base  # noqa: E402
from app import models  # noqa: F401,E402  确保模型注册到 Base.metadata

config = context.config

# 用 app 的库 URL（与运行时一致；测试可经 DATABASE_URL 覆盖 resolved_database_url）
config.set_main_option("sqlalchemy.url", settings.resolved_database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# FTS 影子表前缀，跳过不纳入迁移
_FTS_PREFIX = "knowledge_documents_fts"


def _include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and name.startswith(_FTS_PREFIX):
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=_include_object,
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=_include_object,
            render_as_batch=True,  # SQLite 安全的批量变更
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

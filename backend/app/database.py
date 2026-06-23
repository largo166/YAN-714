"""数据库引擎、会话与初始化。

P1 稳态加固（桌面级低成本修法，非换 Postgres）：
- WAL 模式 + busy_timeout：提升并发读写、减少 database is locked。
- 撞锁重试 with_write_retry：捕获 OperationalError(locked)，指数退避 ≤3 次。
"""
from __future__ import annotations

import time
from typing import Callable, TypeVar

from sqlalchemy import create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

# timeout=15：SQLite 连接级等待锁释放秒数（纲要 P1）
engine = create_engine(
    settings.resolved_database_url,
    connect_args={"check_same_thread": False, "timeout": 15},
    future=True,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _conn_record):
    """每个新连接启用 WAL + busy_timeout（仅对 SQLite 生效）。"""
    if not settings.resolved_database_url.startswith("sqlite"):
        return
    cur = dbapi_conn.cursor()
    try:
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=15000")  # 毫秒
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA foreign_keys=ON")
    finally:
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

_T = TypeVar("_T")


def with_write_retry(fn: Callable[[], _T], *, attempts: int = 3, base_delay: float = 0.1) -> _T:
    """对写操作做撞锁重试：捕获 'database is locked'，指数退避，最多 attempts 次。

    用法：with_write_retry(lambda: (db.add(x), db.commit()))。
    仅吞 locked 类 OperationalError；其它异常原样抛出。
    """
    last_exc: OperationalError | None = None
    for i in range(attempts):
        try:
            return fn()
        except OperationalError as exc:
            if "locked" not in str(exc).lower():
                raise
            last_exc = exc
            if i < attempts - 1:
                time.sleep(base_delay * (2 ** i))  # 0.1, 0.2, 0.4...
    assert last_exc is not None
    raise last_exc


def get_db():
    """FastAPI 依赖：每请求一个会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """建表 + FTS 索引 + 初始数据（幂等）。

    schema 演进自 P1 起以 Alembic 为权威（backend/alembic/versions/）。
    这里保留 create_all 仅用于：测试临时库 / 全新空库的自举建表（与基线迁移结构一致）。
    既有真实库已 `alembic stamp 0001_initial_baseline`，今后加表/改列走迁移脚本，不再裸跑 ALTER。
    """
    from . import models  # noqa: F401  确保模型已注册

    Base.metadata.create_all(bind=engine)

    # 兼容旧库的补列（已 deprecated，保留不删；新 schema 一律走 Alembic）
    _ensure_columns()

    # 知识库 FTS5 索引（可用时）
    from . import retrieval

    db = SessionLocal()
    try:
        retrieval.ensure_fts(db)
    finally:
        db.close()

    from .seed import seed_if_empty

    seed_if_empty()


def _ensure_columns() -> None:
    """[DEPRECATED] 旧的手工补列（裸跑 ALTER）。P1 起 schema 走 Alembic，本函数保留仅为
    兼容『升级前用 create_all 起过、缺 workspace_path 列』的历史库，不再扩展。新增列请写迁移脚本。
    """
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "app_settings" in insp.get_table_names():
        cols = {c["name"] for c in insp.get_columns("app_settings")}
        if "workspace_path" not in cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE app_settings ADD COLUMN workspace_path VARCHAR(500) DEFAULT ''")
                )

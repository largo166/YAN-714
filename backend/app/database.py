"""数据库引擎、会话与初始化。

P1 稳态加固（桌面级低成本修法，非换 Postgres）：
- WAL 模式 + busy_timeout：提升并发读写、减少 database is locked。
- 撞锁重试 with_write_retry：捕获 OperationalError(locked)，指数退避 ≤3 次。

检查点0（数据库地基）：
- 启动前自动备份 sqlite 库文件（含 WAL 落盘），再跑 alembic upgrade head。
- schema 升级以 Alembic 为权威；create_all 退居空库/测试库自举兜底。
"""
from __future__ import annotations

import shutil
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path
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

    检查点0 起顺序钉死：① 备份现有 sqlite 库 → ② alembic upgrade head → ③ create_all 兜底
    → ④ FTS → ⑤ seed。备份必须在升级前，坏迁移时数据有退路。

    schema 演进自 P1 起以 Alembic 为权威（backend/alembic/versions/）。
    create_all 仅用于：测试临时库 / 全新空库的自举建表（与基线迁移结构一致，且对已存在的表是 no-op）。
    既有真实库已 `alembic stamp 0001_initial_baseline`，今后加表/改列走迁移脚本，不再裸跑 ALTER。
    """
    from . import models  # noqa: F401  确保模型已注册

    # ① 升级前先备份（仅 sqlite；失败即抛，不拿没备份的库赌迁移）
    _backup_database()

    # ② alembic 升到 head（已有库的列升级在此发生；空库/已 head 则快速 no-op）
    _run_migrations()

    # ③ create_all 兜底：只对「尚不存在的表」建（空库自举 / 测试临时库）；已存在表 no-op
    Base.metadata.create_all(bind=engine)

    # 兼容旧库的补列（已 deprecated，保留不删；新 schema 一律走 Alembic）
    _ensure_columns()

    # ④ 知识库 FTS5 索引（可用时）
    from . import retrieval

    db = SessionLocal()
    try:
        retrieval.ensure_fts(db)
    finally:
        db.close()

    # ⑤ 空库播种
    from .seed import seed_if_empty

    seed_if_empty()


# ── 检查点0：sqlite 备份 + alembic 升级（frozen/dev 双分支） ──

BACKUP_KEEP = 5  # 保留最近 N 份备份，更旧的删


def _sqlite_path() -> Path | None:
    """从 resolved_database_url 解析 sqlite 文件绝对路径；非 sqlite（如 Postgres）返回 None。"""
    url = settings.resolved_database_url
    if not url.startswith("sqlite"):
        return None
    # 形如 sqlite:///C:/x/rom_ai.db（三斜杠后即绝对路径）；内存库 ':memory:' 不备份
    tail = url.split("sqlite:///", 1)[-1]
    if not tail or tail == ":memory:":
        return None
    return Path(tail)


def _backup_database() -> None:
    """升级前备份 sqlite 库文件。WAL 模式下先 checkpoint 把 -wal 落进主库，再整体拷贝。

    落 DATA_DIR/backups/rom_ai.<YYYYMMDD-HHMMSS>.db（连同 -wal/-shm 一并拷，保证可独立打开）。
    库不存在（全新空库首启）→ 跳过（无数据可备）。备份失败 → 抛 RuntimeError 中止启动。
    """
    db_path = _sqlite_path()
    if db_path is None or not db_path.exists():
        return  # 非 sqlite 或空库首启：无需/无法备份

    try:
        # WAL checkpoint(TRUNCATE)：把预写日志合并进主库文件，使拷贝出的主库是最新完整状态
        conn = sqlite3.connect(str(db_path))
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        finally:
            conn.close()

        backups_dir = db_path.parent / "backups"
        backups_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        dst = backups_dir / f"{db_path.stem}.{ts}.db"
        shutil.copy2(str(db_path), str(dst))
        # -wal/-shm 若 checkpoint 后仍存在，一并拷（防个别环境未清）
        for suffix in ("-wal", "-shm"):
            side = db_path.with_name(db_path.name + suffix)
            if side.exists():
                shutil.copy2(str(side), str(dst.with_name(dst.name + suffix)))

        _rotate_backups(backups_dir, db_path.stem)
    except (OSError, sqlite3.Error) as e:
        raise RuntimeError(f"启动前数据库备份失败，已中止启动以保护数据：{e}") from e


def _rotate_backups(backups_dir: Path, stem: str) -> None:
    """只保留最近 BACKUP_KEEP 份 .db 备份，更旧的连同其 -wal/-shm 删除。"""
    backups = sorted(
        backups_dir.glob(f"{stem}.*.db"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[BACKUP_KEEP:]:
        for p in (old, old.with_name(old.name + "-wal"), old.with_name(old.name + "-shm")):
            try:
                p.unlink()
            except OSError:
                pass


def _alembic_dir() -> Path:
    """定位打包进程/开发进程各自的 alembic 目录（含 alembic.ini 与 versions/）。

    - 冻结态(exe)：alembic 目录被 PyInstaller 打进 _MEIPASS/alembic（见 romai.spec datas）。
    - 开发态：backend/alembic（本文件在 backend/app/，parents[1] = backend/）。
    这是 exe 化最易漏的坑：datas 没收录 versions/*.py 时，dev 全绿、exe 启动才炸。
    """
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1])) / "alembic"
    return Path(__file__).resolve().parents[1] / "alembic"


def _run_migrations() -> None:
    """alembic upgrade head（嵌入式调用）。失败即抛，中止启动——不留半升级的库。

    URL 动态注入 resolved_database_url；script_location 按 frozen/dev 双分支动态指向。
    """
    from alembic import command
    from alembic.config import Config

    alembic_dir = _alembic_dir()
    ini_path = alembic_dir.parent / "alembic.ini"

    cfg = Config(str(ini_path) if ini_path.exists() else None)
    cfg.set_main_option("script_location", str(alembic_dir))
    cfg.set_main_option("sqlalchemy.url", settings.resolved_database_url)

    try:
        command.upgrade(cfg, "head")
    except Exception as e:  # noqa: BLE001  升级失败必须中止启动（数据已备份，可回滚）
        raise RuntimeError(
            f"数据库迁移失败（alembic upgrade head），已中止启动。"
            f"数据已在 backups/ 备份，可排查后重试：{e}"
        ) from e


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

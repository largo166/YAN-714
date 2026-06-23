"""P1 测试：SQLite WAL/busy_timeout 生效 + with_write_retry 重试语义。"""
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database import SessionLocal, with_write_retry


def test_wal_enabled():
    db = SessionLocal()
    try:
        mode = db.execute(text("PRAGMA journal_mode")).scalar()
        # WAL（文件库）或内存库下可能为 memory；至少不应是默认 delete 锁定模式
        assert str(mode).lower() in ("wal", "memory")
        busy = db.execute(text("PRAGMA busy_timeout")).scalar()
        assert int(busy) >= 15000
    finally:
        db.close()


def test_write_retry_succeeds_first_try():
    calls = {"n": 0}

    def op():
        calls["n"] += 1
        return "ok"

    assert with_write_retry(op) == "ok"
    assert calls["n"] == 1


def test_write_retry_recovers_after_locked():
    calls = {"n": 0}

    def op():
        calls["n"] += 1
        if calls["n"] < 2:
            raise OperationalError("stmt", {}, Exception("database is locked"))
        return "done"

    assert with_write_retry(op, base_delay=0.001) == "done"
    assert calls["n"] == 2


def test_write_retry_reraises_non_lock_error():
    def op():
        raise OperationalError("stmt", {}, Exception("syntax error"))

    try:
        with_write_retry(op, attempts=2, base_delay=0.001)
        assert False, "应抛出非 locked 的 OperationalError"
    except OperationalError as e:
        assert "syntax" in str(e).lower()

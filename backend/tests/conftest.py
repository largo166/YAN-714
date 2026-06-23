"""测试隔离：用独立临时 SQLite 库，避免污染开发库 backend/data/rom_ai.db。

必须在导入 app 之前设置 DATABASE_URL（config 在 import 时读取 env）。
"""
import os
import tempfile
from pathlib import Path

_TEST_DB = Path(tempfile.gettempdir()) / "rom_ai_pytest.db"
if _TEST_DB.exists():
    _TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB.as_posix()}"

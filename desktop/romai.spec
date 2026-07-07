# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller 打包规格：ROM-AI 桌面 exe（PyWebview + 内嵌 FastAPI + 前端 dist）。

构建：
    cd "C:\\ROM-AI-Claude 开发"
    python -m PyInstaller desktop/romai.spec --noconfirm
产物：dist/ROM-AI.exe（onefile）

要点：
- 入口 desktop/launcher.py；backend/ 加进 pathex 以导入 app 包。
- 打包前端 frontend/dist → 运行时 _MEIPASS/frontend_dist（config.frontend_dist_dir 冻结态解析处）。
- 可写数据(DB/上传/.env)落 %LOCALAPPDATA%/ROM-AI，不进 bundle（config 已处理）。
"""
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

ROOT = Path(SPECPATH).resolve().parent          # 仓库根（spec 在 desktop/ 下）
BACKEND = ROOT / "backend"
DIST_FRONT = ROOT / "frontend" / "dist"

# collect_submodules("app") 在 spec 求值期就需要能导入 app，pathex 只作用于 Analysis，故先入路径
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# ── 前端构建产物随包，运行时解到 _MEIPASS/frontend_dist ──
datas = [(str(DIST_FRONT), "frontend_dist")]

# ── alembic 迁移随包（检查点0 · exe 化最易漏的坑）──
# database._alembic_dir() 冻结态取 _MEIPASS/alembic；_run_migrations() 取 _MEIPASS/alembic.ini。
# 必须把整个 backend/alembic 目录(含 versions/*.py，保结构)与 alembic.ini 打进去，
# 否则 exe 启动跑 alembic upgrade 时找不到迁移脚本 → dev 全绿、打包那刻才炸、报错隐晦。
ALEMBIC_DIR = BACKEND / "alembic"
ALEMBIC_INI = BACKEND / "alembic.ini"
if ALEMBIC_DIR.is_dir():
    datas.append((str(ALEMBIC_DIR), "alembic"))          # → _MEIPASS/alembic/（versions/ 结构保留）
if ALEMBIC_INI.is_file():
    datas.append((str(ALEMBIC_INI), "."))                # → _MEIPASS/alembic.ini

# ── 预置 key 分发(可选):若 desktop/.env.bundle 存在,打进 _MEIPASS 根 ──
# 不入 git(.gitignore 的 .env.*)。首启 config._bootstrap_bundled_env 复制到 DATA_DIR/.env。
# 无此文件时正常打包(空 key,收件人自己在设置页填)。
BUNDLE_ENV = ROOT / "desktop" / ".env.bundle"
if BUNDLE_ENV.is_file():
    datas.append((str(BUNDLE_ENV), "."))
# 带数据/模板的第三方包
for pkg in ("docx", "pptx", "fitz", "pymupdf"):
    try:
        datas += collect_data_files(pkg)
    except Exception:
        pass

# ── 隐藏导入：uvicorn 动态加载的 loop/protocol/lifespan + 后端全部子模块 ──
hiddenimports = []
hiddenimports += collect_submodules("uvicorn")
hiddenimports += collect_submodules("app")          # 后端包（含全部 routers/服务）
hiddenimports += collect_submodules("anyio")
hiddenimports += [
    "uvicorn.loops.auto", "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto", "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto", "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan.on", "uvicorn.lifespan.off",
    "fastapi", "starlette", "pydantic", "pydantic_settings",
    "sqlalchemy", "alembic",
    "httpx", "h11", "sniffio", "anyio",
    "webview", "clr",
    "fitz", "docx", "pptx",
    "app.main", "app.config", "app.database", "app.models",
]


a = Analysis(
    [str(ROOT / "desktop" / "launcher.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "PyQt5", "PySide6"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="ROM-AI",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,         # 窗口化:双击只开 ROM-AI 窗口,不弹控制台;启动日志写 DATA_DIR/launcher.log
    disable_windowed_traceback=False,
    icon=None,
)

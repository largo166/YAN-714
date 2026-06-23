#!/usr/bin/env bash
# 启动后端 dev server（Git Bash / macOS / Linux）
set -e
cd "$(dirname "$0")/.."

PY="backend/.venv/Scripts/python.exe"
[ -x "$PY" ] || PY="backend/.venv/bin/python"

if [ ! -x "$PY" ]; then
  echo "[setup] 创建 venv 并安装后端依赖..."
  python -m venv backend/.venv
  PY="backend/.venv/Scripts/python.exe"
  [ -x "$PY" ] || PY="backend/.venv/bin/python"
  "$PY" -m pip install -r backend/requirements.txt
fi

[ -f backend/.env ] || cp backend/.env.example backend/.env

echo "[run] 后端: http://127.0.0.1:8000"
exec "$PY" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload

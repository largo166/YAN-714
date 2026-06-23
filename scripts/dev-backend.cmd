@echo off
REM 启动后端 dev server（FastAPI + uvicorn，自动 reload）
setlocal
cd /d "%~dp0\.."

if not exist "backend\.venv\Scripts\python.exe" (
  echo [setup] 创建 venv 并安装后端依赖...
  python -m venv backend\.venv
  backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
)

if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul

echo [run] 后端: http://127.0.0.1:8000  (健康检查 /health, 文档 /docs)
backend\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload

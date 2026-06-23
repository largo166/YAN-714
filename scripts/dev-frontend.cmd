@echo off
REM 启动前端 dev server（Vite）
setlocal
cd /d "%~dp0\..\frontend"

if not exist "node_modules" (
  echo [setup] 安装前端依赖...
  call npm install
)

if not exist ".env" copy ".env.example" ".env" >nul

echo [run] 前端: http://127.0.0.1:5173
call npm run dev

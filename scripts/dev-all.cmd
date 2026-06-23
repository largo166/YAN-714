@echo off
REM 一键启动前后端（各开一个窗口）
setlocal
cd /d "%~dp0"

start "ROM-AI Backend" cmd /k dev-backend.cmd
start "ROM-AI Frontend" cmd /k dev-frontend.cmd

echo 已启动:
echo   后端  http://127.0.0.1:8000
echo   前端  http://127.0.0.1:5173

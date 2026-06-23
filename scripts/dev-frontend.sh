#!/usr/bin/env bash
# 启动前端 dev server（Git Bash / macOS / Linux）
set -e
cd "$(dirname "$0")/../frontend"

[ -d node_modules ] || npm install
[ -f .env ] || cp .env.example .env

echo "[run] 前端: http://127.0.0.1:5173"
exec npm run dev

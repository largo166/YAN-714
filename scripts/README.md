# scripts/ — 开发启动脚本

不依赖旧项目，只驱动本工程的 `frontend/` 与 `backend/`。

## 一键开发启动

| 目的 | Windows（cmd） | Git Bash / *nix |
| --- | --- | --- |
| 启动后端 | `scripts\dev-backend.cmd` | `bash scripts/dev-backend.sh` |
| 启动前端 | `scripts\dev-frontend.cmd` | `bash scripts/dev-frontend.sh` |
| 一键起前后端 | `scripts\dev-all.cmd` | 分别开两个终端跑上面两个 |

首次运行会自动：创建后端 venv 并装依赖、装前端 node 依赖、从 `.env.example` 生成 `.env`。

## 访问地址

- 后端：<http://127.0.0.1:8000>（健康检查 `/health`，OpenAPI 文档 `/docs`）
- 前端：<http://127.0.0.1:5173>

## 端口被占用

- 后端：改 `--port`（脚本里）或设环境变量后用 uvicorn 自定义端口。
- 前端：Vite 默认 5173，被占用时会自动顺延，或在 `frontend/vite.config.ts` 改 `server.port`；同时把 `frontend/.env` 的 `VITE_API_BASE_URL` 与后端端口对齐。

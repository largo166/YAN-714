# ROM-AI（干净重开发版）

本地优先的桌面端 AI 工作台（建筑设计前期）。本仓库是 **干净重开发** 工程，单一技术栈、单一启动链路。

- 前端：React 19 + TypeScript 5.9 + Vite 7 + Tailwind CSS 3.4 + shadcn 风格组件 + React Router 7 + Recharts + React Hook Form + Zod
- 后端：FastAPI + SQLite（Python 本地桌面主线）
- 桌面：PyWebview 方向（当前仅占位）

## 目录

```text
frontend/   React + Vite 前端（API client 统一在 src/lib/api.ts）
backend/    FastAPI + SQLite 后端（app/，最小 API + init_db/seed）
desktop/    桌面壳占位（PyWebview 方向）
docs/       工程文档
scripts/    开发启动脚本（不依赖旧项目）
```

## 快速启动

```bash
# 后端（首次自动建 venv + 装依赖 + 生成 .env）
scripts\dev-backend.cmd        # Windows
bash scripts/dev-backend.sh    # Git Bash

# 前端（首次自动 npm install + 生成 .env）
scripts\dev-frontend.cmd       # Windows
bash scripts/dev-frontend.sh   # Git Bash
```

- 后端：<http://127.0.0.1:8000>（`/health`、`/docs`）
- 前端：<http://127.0.0.1:5173>

### 排障：tsc/build 通过，但浏览器报「某方法不存在」/ 白屏

症状：源码已加方法、`npm run typecheck` / `npm run build` 都通过，但浏览器报
`api.xxx is not a function` 或整页白屏。**几乎都是 dev server 长跑导致的 HMR / Vite 缓存脏**
（运行中的内存版本仍是旧模块），不是代码错。

按序处理：

1. **重启 dev server + 清缓存**：在 `frontend/` 下用
   ```bash
   npm run dev:clean
   ```
   它会先杀掉占用 5173 的旧进程、删 `node_modules/.vite`，再 `vite --force` 重新预构建启动。
2. 浏览器 **Ctrl+F5** 强制刷新。
3. 仍报错时，**F12 → Network** 直接打开 `http://127.0.0.1:5173/src/lib/api.ts`，
   确认其中**确有**那个新方法；若没有，说明 dev server 还在用旧缓存，回到第 1 步。

> 平时开发用 `npm run dev` 即可；只有遇到上述「改了底层共享文件（如 `api.ts`/类型）后行为对不上」时，
> 才用 `npm run dev:clean`。`vite.config.ts` 已设 `strictPort:true`，端口被占会直接报错退出，
> 不会偷换端口造成「以为在 5173 实则在别处」的混乱。


## 最小 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/api/projects` | 项目列表 |
| POST | `/api/projects` | 新建项目 |
| GET | `/api/settings` | 读取设置 |
| PUT | `/api/settings` | 更新设置 |

## 数据来源原则

页面数据一律经 `frontend/src/lib/api.ts` 调后端，后端用 SQLite 落库；初始数据走 `backend/app/seed.py`（seed），**不在页面里硬编码 mock**。详见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 边界（本阶段不做）

PostgreSQL · JWT/登录 · 多租户 · 对象存储 · 复杂云端 · Electron 安装包/自动更新 · git commit/push/部署。

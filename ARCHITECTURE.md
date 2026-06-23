# ARCHITECTURE — ROM-AI 干净重开发

## 1. 目标与边界

单一技术栈、单一启动链路的本地桌面工作台。**只保留一套前端**，不允许：`frontend-v2`、新旧前端重叠、旧 Electron 整包复制、多套冲突启动链路、旧 mock 残留为正式逻辑。

不引入（本阶段）：PostgreSQL、JWT/登录权限、多租户、对象存储、复杂云端、Electron 安装包/自动更新。

## 2. 目录职责

| 目录 | 职责 | 技术 |
| --- | --- | --- |
| `frontend/` | 唯一前端 | React 19 / TS 5.9 / Vite 7 / Tailwind 3.4 / RR7 / Recharts / RHF / Zod |
| `backend/` | API + 数据 | FastAPI / SQLite / SQLAlchemy / Pydantic v2 |
| `desktop/` | 桌面壳占位 | PyWebview 方向（未启用） |
| `docs/` `scripts/` | 文档 / 启动脚本 | — |

## 3. 前端结构

```text
frontend/src/
  main.tsx            入口
  App.tsx             路由（createBrowserRouter, RR7）
  index.css           Tailwind + shadcn CSS 变量
  lib/
    api.ts            唯一 API client（fetch + Zod 校验），页面不散落 fetch
    utils.ts          cn()
  types/schemas.ts    Zod schema + 类型（与后端对齐）
  components/
    ui/               shadcn 风格基础组件（button/card/input/label/badge）
    layout/AppLayout  侧栏 + Outlet
  pages/              Dashboard / Projects / Settings
```

数据流：页面 → `api.ts` → 后端 `/api/*` → SQLite。响应经 Zod 解析后进入页面状态。

## 4. 后端结构

```text
backend/app/
  main.py             FastAPI 应用 + CORS + lifespan(init_db)
  config.py           pydantic-settings，路径相对 backend/ 解析（与 cwd 无关）
  database.py         engine / SessionLocal / Base / init_db
  models.py           Project / AppSetting（SQLAlchemy 2.0 typed）
  schemas.py          Pydantic v2 请求/响应
  seed.py             初始数据（仅空库时写入；非页面 mock）
  routers/            health / projects / settings
backend/tests/        pytest（隔离临时库）
```

## 5. API 契约

| 方法 | 路径 | 请求 | 响应 |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status, service, database}` |
| GET | `/api/projects` | — | `{items: Project[], total}` |
| POST | `/api/projects` | `{name, description?, status?}` | `Project`（201） |
| GET | `/api/settings` | — | `Settings` |
| PUT | `/api/settings` | 部分字段 | `Settings` |

`Project = {id, name, description, status, created_at, updated_at}`
`Settings = {deepseek_api_key, deepseek_base_url, deepseek_model, theme}`

## 6. 环境变量

- 后端 `backend/.env`（示例 `.env.example`）：`HOST` `PORT` `DATABASE_URL` `CORS_ORIGINS` `DEEPSEEK_*`。
- 前端 `frontend/.env`：`VITE_API_BASE_URL`。
- 真实密钥只进本机 `.env`（被 `.gitignore` 排除），不入仓库。

## 7. mock / 数据原则

- 页面**不硬编码假数据**；初始数据用 `backend/app/seed.py`（落库的真实行，可删可改）。
- 如需测试/演示固定数据，放专门的 `fixtures`/`mock` 目录并标注「仅测试」，不进 dev 主链路。

## 8. 桌面方向

`desktop/launcher.py` 为占位（未启用）。后续：本地起 FastAPI + PyWebview 打开本地 Web UI；不走 Electron 安装包/自动更新。

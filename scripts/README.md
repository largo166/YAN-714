# scripts/ — 开发启动脚本

不依赖旧项目，只驱动本工程的 `frontend/` 与 `backend/`。

## 一键启动（生产形态 · 推荐，杜绝红字）

```
powershell -ExecutionPolicy Bypass -File scripts\start-romai.ps1
```

它做四件事：**停** 5173/4173/8000 旧服务 → **build** 前端 dist → **启**后端(无 reload，同源托管 dist) → **只打开** <http://127.0.0.1:8000/seasky.html>。

**为什么用它**：唯一入口 = 8000，页面与 `/api` 同源，永不出「连不到后端」的满屏红字。开发端口全被关掉，想开错也没得开。**验收/看效果一律用这个地址。**

## 一键开发启动（dev，仅供改代码时热更新）

| 目的 | Windows（cmd） | Git Bash / *nix |
| --- | --- | --- |
| 启动后端 | `scripts\dev-backend.cmd` | `bash scripts/dev-backend.sh` |
| 启动前端 | `scripts\dev-frontend.cmd` | `bash scripts/dev-frontend.sh` |
| 一键起前后端 | `scripts\dev-all.cmd` | 分别开两个终端跑上面两个 |

首次运行会自动：创建后端 venv 并装依赖、装前端 node 依赖、从 `.env.example` 生成 `.env`。

> dev 端口(5173) 只用于改代码时热更新；**它的页面表现不作证据**。若前端连不到后端，会显示「后端未连接·请从 8000 打开」的单一提示——这是设计如此，不是 bug。

## 访问地址

- 生产入口（唯一验收地址）：<http://127.0.0.1:8000/seasky.html>
- 后端：<http://127.0.0.1:8000>（健康检查 `/health`，版本自检 `/api/app/version`，OpenAPI 文档 `/docs`）
- 前端 dev：<http://127.0.0.1:5173>（仅热更新，不作证据）

## 公网验收（HTTPS + 服务端访问口令）

1. 从 `deploy/public.env.example` 复制 `deploy/public.env` 并填写强口令与会话密钥（本机文件，不进 git）。
2. 运行 `scripts/build-public.ps1`，生成同源生产 `dist`。
3. 运行 `scripts/start-public-backend.ps1`，只监听本机 `127.0.0.1:8010`（与本地生产入口 8000 隔离）。
4. 运行 `scripts/start-public-tunnel.ps1`，取得临时 `https://*.trycloudflare.com` 地址。

Quick Tunnel 只用于公网验收，URL 会随进程重启变化且不支持 SSE。固定域名生产部署需配置 Cloudflare named tunnel token 并注册为 Windows 服务；不要把 Quick Tunnel 当长期入口。

## 端口被占用

- 后端：改 `--port`（脚本里）或设环境变量后用 uvicorn 自定义端口。
- 前端：Vite 默认 5173，被占用时会自动顺延，或在 `frontend/vite.config.ts` 改 `server.port`；同时把 `frontend/.env` 的 `VITE_API_BASE_URL` 与后端端口对齐。

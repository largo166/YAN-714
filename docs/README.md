# docs/ — 工程文档

本工程为 **ROM-AI 干净重开发** 版本（与旧目录解耦，旧目录仅作只读参考）。

## 文档索引

- 根 [`README.md`](../README.md)：项目总览与快速启动。
- 根 [`ARCHITECTURE.md`](../ARCHITECTURE.md)：架构、技术栈边界、目录职责、API 契约。
- [`scripts/README.md`](../scripts/README.md)：开发启动脚本说明。
- [`backend/`](../backend)：FastAPI + SQLite 后端。
- [`frontend/`](../frontend)：React 19 + Vite 7 + TS + Tailwind 前端。
- [`desktop/`](../desktop)：桌面壳占位（PyWebview 方向）。

## 开发流程现状

已推进到：工程目录 → Git → 依赖安装 → `.env` → dev server → 基础联调与测试。
暂未做：git commit/push/PR、生产部署、桌面打包。

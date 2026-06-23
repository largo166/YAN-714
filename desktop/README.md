# desktop/ — 桌面壳（占位）

当前阶段**只保留方向与最小预留结构**，不引入旧 Electron 链路、不做安装包/自动更新/复杂打包。

## 方向

后续桌面化以 **PyWebview + 本地 FastAPI + Web UI** 为主：

1. 启动 `backend/`（FastAPI，本地 127.0.0.1）。
2. 用 PyWebview 打开本地前端（`frontend/` 构建产物或 dev 地址）。
3. 全程本地、离线、无浏览器外壳。

## 现状

- `launcher.py`：占位入口，**默认不可运行**（未安装 pywebview、未接线），仅声明后续步骤。
- 本阶段开发请直接用 `scripts/` 下的 dev 脚本分别启动前后端。

> 不在本阶段引入：Electron、electron-builder、NSIS 安装包、自动更新。

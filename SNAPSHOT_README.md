# SNAPSHOT_README — ROM-AI 工程（已锁定为唯一权威目录）

> 🔒 **本目录 `C:\ROM-AI-Claude 开发` 已于 2026-06-22 锁定为唯一权威开发目录。**
> 后续 Phase 4D-4G 的全部开发只在此进行。`C:\ROM-AI开发V3-chatgtp-new` 已冻结为只读备份，不再写入、不再从其启动 dev server。

## 信息
- **锁定时间**：2026-06-22（本地）
- **唯一权威工程目录**：`C:\ROM-AI-Claude 开发`
- **冻结备份（只读）**：`C:\ROM-AI开发V3-chatgtp-new`
- **旧项目（只读参考）**：`C:\ROM-AI开发V3-chatgtp`
- **来源**：由 `...chatgtp-new` 纯源码复制（已排除依赖/数据/.env），并在本目录 git init 独立成仓库。

## 当前完成阶段
- ✅ 新工程骨架完成
- ✅ 原 HTML 版 ROM-AI UI 保真迁移完成（五板块视觉 + 原版 legacy CSS）
- ✅ 设置抽屉 9 组恢复完成
- ✅ Phase 4B：AI 对话 + 知识库核心闭环完成
- ✅ Phase 4C：项目目录读取 + 安全清理完成

## 当前未完成阶段
- ⬜ Phase 4D：项目中心文件上传 / 解析 / AI 研判
- ⬜ Phase 4E：会议纪要五段式
- ⬜ Phase 4F：A2 生图三卡 + 成果卡回流
- ⬜ Phase 4G：管理驾驶舱 / 协作平台真实数据

## 如何恢复依赖
- **前端**：`cd frontend` → `npm install`
- **后端**：`cd backend` → `python -m venv .venv` → `.venv\Scripts\activate` → `pip install -r requirements.txt`
- **环境变量**：本快照**未含 `.env`**。需从 `.env.example` 复制：
  - `backend/.env`（从 `backend/.env.example`）
  - `frontend/.env`（从 `frontend/.env.example`）

## 如何启动
- 后端：`python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload`
- 前端：`cd frontend && npm run dev`（默认 http://127.0.0.1:5173）
- 或用脚本：`scripts\dev-backend.cmd`、`scripts\dev-frontend.cmd`、`scripts\dev-all.cmd`

## 当前测试结果摘要
- 后端 **pytest 17 passed**
- 前端 **typecheck / build / lint 通过**
- 浏览器 **console 0 error**

## 注意事项
- 旧项目 `C:\ROM-AI开发V3-chatgtp` 只读，勿写入。
- `.env` 未复制，需按 `.env.example` 创建。
- DeepSeek Key 未配置时 AI 返回 `not_configured`（正确行为，非 bug）。
- 真实项目目录 `C:\Users\yz_ya\Desktop\石家庄市庄项目` 只做 scan / preview，**不做 cleanup apply**。

## 从该快照恢复继续开发
可以。本快照含全部源码 + 文档，恢复依赖（npm install / pip install）+ 创建 `.env` 后即可继续。**下一步从 Phase 4D 开始，不要重做 4B/4C。** 详见 `START_HERE.md`。

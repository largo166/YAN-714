# START_HERE — 接手必读（后续 Claude / Codex / 新会话第一时间读这份）

> 这不是普通说明，是**接手指令**。读完你应当无需再问用户，就知道：当前状态、目录边界、下一步任务、验证方式。
> **核心铁律：不要重做已完成的 4B/4C，不要把已恢复的 ROM-AI 原版 UI 改成通用模板，从 Phase 4D 继续。**

---

## 1. 当前项目状态（已完成，勿重做）
1. ✅ 新工程骨架完成
2. ✅ 原 HTML 版 ROM-AI UI 保真迁移完成
3. ✅ 五板块视觉恢复完成（项目中心 / 数据基地 / 共创营地 / 协作平台 / 管理驾驶舱）
4. ✅ 设置抽屉 9 组恢复完成
5. ✅ Phase 4B：AI 对话 + 知识库核心闭环完成
6. ✅ Phase 4C：项目目录读取 + 安全清理完成
7. ✅ 后端 pytest **17 passed**
8. ✅ 前端 typecheck / build / lint 通过
9. ✅ 浏览器 console 0 error
10. ✅ 旧项目保持只读
11. ✅ 真实「石家庄市庄项目」目录只做 scan / preview，**未执行真实 cleanup apply**

## 2. 目录边界（已锁定）
> 🔒 **唯一权威开发目录 = `C:\ROM-AI-Claude 开发`（本目录）。** 自 2026-06-22 锁定起，后续 4D-4G 的全部开发、测试、文档更新只在本目录进行。
- **唯一权威工程目录（在此开发）**：`C:\ROM-AI-Claude 开发`
- **冻结备份（只读保留，不再写入、不再从此启动 dev server）**：`C:\ROM-AI开发V3-chatgtp-new`
- **旧项目（只读参考，严禁写入）**：`C:\ROM-AI开发V3-chatgtp`
- **真实桌面项目（只读 scan/preview，禁 cleanup apply）**：`C:\Users\yz_ya\Desktop\石家庄市庄项目`

## 3. 接手时必须先读的文件（按顺序）
1. `START_HERE.md`（本文件）
2. `SNAPSHOT_README.md`
3. `ARCHITECTURE.md`
4. `README.md`
5. `docs/MIGRATION_STATUS.md` ← 总状态表，最重要
6. `docs/API_MIGRATION_MAP.md`
7. `docs/OLD_UI_INVENTORY.md`
8. `docs/UI_MIGRATION_MAP.md`
9. `docs/AI_CHAT_DESIGN.md`
10. `docs/KNOWLEDGE_BASE_DESIGN.md`
11. `docs/WORKSPACE_CLEANUP_DESIGN.md`

## 4. 后续开发顺序（从 4D 开始，不是重做前面）
1. **Phase 4D**：项目中心文件上传 / 文件解析 / AI 研判 ← 下一步
2. Phase 4E：会议纪要五段式
3. Phase 4F：A2 生图三卡 + 成果卡回流
4. Phase 4G：管理驾驶舱 / 协作平台真实数据
5. 最终整体验收
6. 之后再考虑 PyWebview 桌面化和 EXE 打包

## 5. Phase 4D 目标
基于已完成的 **AI 对话 API / 知识库 API / workspace scan API / 原 ROM-AI UI**，继续实现：
1. 文件上传
2. 文档解析（PDF / docx / pptx / md / txt）
3. 项目资料入库
4. 知识库索引（复用 4B 的 FTS5）
5. AI 研判任务（项目总览 / 设计难点 / 甲方诉求 / 推进计划 / 汇报提纲）
6. 研判结果保存
7. 把项目中心的「待接入」替换成真实功能

## 6. 禁止后续 agent 重做的内容
1. 不要重新初始化工程
2. 不要重新搭空骨架
3. 不要重新设计 UI
4. 不要把旧 ROM-AI UI 改成通用模板
5. 不要重做 Phase 4B
6. 不要重做 Phase 4C
7. 不要整包复制旧项目
8. 不要恢复旧 Electron 主线

## 7. 高风险边界（必须遵守）
1. 旧项目 `C:\ROM-AI开发V3-chatgtp` 只读
2. 不写旧项目
3. 不删除真实桌面项目文件
4. 不对真实「石家庄市庄项目」目录执行 cleanup apply，除非用户单独确认
5. 不永久删除任何用户文件
6. 不引入 PostgreSQL
7. 不引入 JWT / 登录系统
8. 不引入多租户
9. 不引入对象存储
10. 不执行 git commit / push
11. 不做生产部署
12. 不做 EXE 打包（除非用户明确进入打包阶段）

## 8. 启动和测试命令
**前端**
```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```
**后端**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
**脚本（scripts/）**
```bash
scripts\dev-backend.cmd
scripts\dev-frontend.cmd
scripts\dev-all.cmd
```

## 9. 当前已知阻塞
1. DeepSeek Key 未配置时，AI 对话返回 `not_configured` —— **正确行为，不是 bug**。
2. 真实 DeepSeek 调用需用户在设置页填入 API Key 后再验证。
3. 真实桌面项目目录 cleanup apply 需用户单独确认，不允许自动执行。
4. Phase 4D 可能需新增轻量解析库：`pypdf`、`python-docx`、`python-pptx`。属普通解析依赖，**非高风险架构变更**，但安装前要在报告中说明用途。

## 10. 重新接手后的第一条执行指令
> 请先读取 `START_HERE.md`、`docs/MIGRATION_STATUS.md` 和 `docs/API_MIGRATION_MAP.md`，确认当前已经完成 Phase 4B + 4C，不要重做已完成内容。然后从 **Phase 4D：项目中心文件上传 / 解析 / AI 研判** 开始继续开发。完成后运行前端 build/typecheck/lint、后端 pytest、浏览器 console 检查，并更新 `docs/MIGRATION_STATUS.md`。

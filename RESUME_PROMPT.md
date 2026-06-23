# RESUME_PROMPT — 换机/新会话恢复提示

> 换电脑或新会话时，**把下面这段直接复制发给 Claude**。

---

接手 ROM-AI 项目。唯一权威开发目录是 `C:\ROM-AI-Claude 开发`，只在这个目录工作。
不要碰：`C:\Users\yz_ya\Desktop\代码-ROM-AI开发V3`（旧副本）、`C:\ROM-AI--`、真实「石家庄市庄项目」目录、任何旧分支工程。

请先按顺序读：
1. `C:\ROM-AI-Claude 开发\HANDOFF_CURRENT.md`（当前状态/已知坑/启动命令，最重要）
2. `C:\ROM-AI-Claude 开发\docs\MIGRATION_STATUS.md`
3. `C:\ROM-AI-Claude 开发\docs\FUTURE_CAPABILITY_POOL.md`

工作纪律（必须遵守）：
- **低 token 模式**：正常分析/编码/测试，但不直播过程；只在检查点汇报（完成内容/改动文件/测试结果/是否需决策）。
- **mock ≠ 功能完成**：外部能力(腾讯/DeepSeek)必须 live 验收；每个阶段简报必带 4 行：Mock tests / Live provider test / Live product API test / User-side real scenario required。
- 动真实文件/库/装依赖前先出**文件级改动计划**等我确认；动真实文件可逆；不重做已完成；不删构建/迁移/演示代码（死代码标 deprecated）。
- 不引 PG/JWT/多租户/对象存储；不 commit/push；不打包 EXE；不碰真实「石家庄项目」目录。
- 验证权威目录**手动起服务**（preview 会跑错旧目录）；改代码后先确认 8000 没被 stale uvicorn 占。

先做状态确认再进下一阶段：
- 确认 cwd = 权威目录；
- 跑 `cd backend && .venv\Scripts\python -m pytest -q`（期望 57 passed, 1 skipped）；
- 前端 `npm run typecheck && npm run lint && npm run build`；
- `git diff` / Alembic current（期望 head=0004_meeting_tencent）；
- 若依赖缺失，按 HANDOFF §6 重装（python -m venv + pip install -r requirements.txt；npm install；从 .env.example 配 .env）。

下一阶段候选（**等我确认后再动手，先出计划**）：
1. 数据基地 Phase（知识库 D0 / 检索升级 P6）；
2. 会议中心流程重构（项目中心 KPI 真数据 / 纪要回流知识库 / 一键建会产品级 live）；
3. 音频 ASR Spike（确认方案后再启用 transcription.py）；
4. 真实腾讯带录制会议端到端验证（智能纪要同步，需我先开会）。

先读文件、做状态确认，把当前状态简报给我，再问我做哪个候选，不要自己直接开新功能。

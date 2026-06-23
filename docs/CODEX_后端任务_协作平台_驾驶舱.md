# Codex 后端任务 · 协作平台(C4) / 管理驾驶舱(C5)所需端点

> Claude(前端)→ Codex(后端) 指令。与 `docs/CODEX_后端任务_项目中心.md` 同款精度。
> 归属：全部 `backend/**`，**Codex 独占**；Claude 不碰后端。完成后在 `docs/API_CONTRACT.md` 记一行。
> 参考(只读)：V3 `routes/team.py`/`boss.py`/`broadcast.py` + `models.TeamMember/Broadcast` —— **只借鉴字段/意图，禁止整包搬、禁引 service 层**（原则 6/8）。

## 0. 通用约束（与 C1 一致，务必遵守）
- **SQLAlchemy ORM**；新表/字段走 **Alembic 可回滚迁移**（红线，禁裸 ALTER）。
- **不伪造**（原则 9/13）：无数据 → `{"items": []}`；无配置 → `{"status": "not_configured"}`。前端据此走空态。
- read-only 优先；每端点配错误分支测试，对齐 pytest 全绿（当前 67 passed）。
- 建表序遵守总纲 §7.3：本批只需 **TeamMember → Broadcast** 两张表（其余先不建）。

---

## C4 · 协作平台（`HubPage.tsx`）

### B4.1 团队成员 `GET /api/team/members`
- **新表 `team_members`**（Alembic）：`id:int pk` · `name:str` · `role:str` · `duty:str=""`(工作分工) · `birthday:str=""`(MM-DD，生日走马灯用) · `status:str="active"` · `created_at`。
- **响应**：`{ "items": [ { "id": int, "name": str, "role": str, "duty": str, "birthday": str } ] }`
- **承担任务字段**：HTML 卡片有「承担任务 · 6/29 · 项目中心分派」。本批**先不做**任务关联（避免引 TeamAssignment 表）；响应**不含** task 字段，前端该行先空着或显「未分派」。后续 B4.4 再加。
- 空表 → `{"items": []}`（前端显「暂无成员，点添加成员录入」）。
- 配套：`POST /api/team/members`(录入) + `PUT /api/team/members/{id}`(改 duty，对应 HTML 的 contenteditable 工作分工)。**read-only 列表先行，写接口可同批或下一刀。**

### B4.2 智能助手目录 `GET /api/agents`
- **内置常量**（不建表，运行时独立，类比已上线 `/api/skills`）：找图小雷达/材料小帮手/审图老法师/翻模小王子。
- **响应**：`{ "items": [ { "id": str, "name": str, "role": str, "duty": str, "output": str, "status": "ok"|"plan" } ] }`
  - 对齐 HTML：找图小雷达/材料小帮手 `status=ok`(可用)；审图老法师/翻模小王子 `status=plan`(规划中)。
- ⚠️ 总纲 §6：`agents` **只做目录，不替换 chat.py**。

### B4.3 走马灯/通知 `GET /api/broadcast/ticker`
- 与 C5 的 broadcast 同源（见 B5.3）。返回当前生效通知 + 生日提醒。
- **响应**：`{ "items": [ { "kind": "broadcast"|"birthday", "text": str } ] }`；空 → `{"items": []}`。

---

## C5 · 管理驾驶舱（`BossPage.tsx`）

> 红线提醒：HTML 里**飞书项目看板(合同进度)** 和 **项目评论** 是飞书集成预览，**当前无真实数据源**。这两块**必须返回 `not_configured` / 空**，前端显「飞书未接入」占位，**绝不伪造合同百分比/收款逾期/评论**。

### B5.1 跨项目 dashboard `GET /api/boss/dashboard`
- **真实聚合**（用现有 projects/meetings/project_analyses，免新表）：
  - `active_projects`: status 进行中的项目数
  - `near_delivery`: 暂无真实里程碑日期源 → 先返回 `0`（不要编 14 天内）
  - `high_risks`: 跨项目 `_project_risks` level=high 计数（复用 C1 已写的 `_project_risks`）
  - `ai_usage_week`: 本周 project_analyses + meeting_minutes 生成条数（真实可数）
- **响应**：`{ "active_projects": int, "near_delivery": int, "high_risks": int, "ai_usage_week": int }`

### B5.2 成员工作量 `GET /api/boss/workload`
- **真实来源**：按成员统计其名下进行中任务/研判数，归一成百分比；无任务源 → `{"items": []}`。
- **响应**：`{ "items": [ { "name": str, "pct": int, "level": "high"|"medium"|"low" } ] }`

### B5.3 全员通知 broadcast
- **新表 `broadcasts`**（Alembic）：`id:int pk` · `text:str` · `active:bool=true` · `created_at`。
- `GET /api/broadcast/broadcasts` → `{ "items": [ { "id": int, "text": str, "created_at": str } ] }`
- `POST /api/broadcast/broadcasts` body `{ "text": str }` → 创建（驾驶舱「发布」按钮 + 写回走马灯 B4.3）。
- 空 → `{"items": []}`。

### B5.4 AI 使用按能力 `GET /api/boss/ai-usage`
- **真实来源**：按 task 类型统计 project_analyses/meeting 生成次数（PPT/纪要/生图/评审/任务）。无则各 0。
- **响应**：`{ "items": [ { "capability": str, "count": int } ] }`

### B5.5（不做·明确标注 not_configured）
- **飞书项目看板合同进度**：无飞书集成 → 提供 `GET /api/boss/feishu-board` 返回 `{ "status": "not_configured", "items": [] }`。
- **项目评论**：同上 `{ "status": "not_configured", "items": [] }`。
- 前端据此显「飞书未接入」占位，不渲染假合同/评论。

---

## 交付后
- `docs/API_CONTRACT.md` 写各端点最终响应形状。
- Claude 据此重写 `HubPage.tsx`/`BossPage.tsx`：删 `MEMBERS/AGENTS` 及 boss 全部硬编码 mock → 真实拉取 + 空态/`not_configured`（前端 lane，C4/C5 实施）。
- 本批新表仅 **team_members + broadcasts** 两张；dashboard/workload/ai-usage/risks 全部复用既有表聚合，**不新建大量表**。

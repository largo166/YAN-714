# Codex 后端任务 · 项目中心(C1)所需端点

> Claude(前端)→ Codex(后端) 指令。前端 `ProjectCenterPage.tsx` 的「里程碑 / 风险看板 / 可复用资产 / grid3 KPI」结构壳已就位（空态），**等下列端点即可接真数据，前端零返工**。
> 归属：这些全是 `backend/**`，**Codex 独占**；Claude 不碰后端。完成后请在 `docs/API_CONTRACT.md` 记一行。

## 0. 通用约束（务必遵守）
- **SQLAlchemy ORM**（`db.query(models.X)`），不是 sqlite3、不引 service 层（纠正总纲 §7.2 过期描述）。
- **不伪造**：无数据返回 `{"items": []}`，前端自动走空态（原则 9/13）。
- 新增字段/表走 **Alembic 可回滚迁移**（红线，禁裸 `ALTER TABLE`）。
- 每个端点配错误分支测试（404 等），对齐 pytest 全绿基线（当前 59 passed）。
- 全部 **read-only 优先**，挂在现有 `routers/projects.py` 或新 `routers/project_board.py` 均可。

## 1. 里程碑 `GET /api/projects/{id}/milestones`
- **响应**：`{ "items": [ { "title": str, "owner": str, "due": str, "urgent": bool } ] }`
- **真实数据源（复用已有，免新表）**：聚合该项目各会议 `meeting_minutes.todos_json`（最新一版/会议，与 `/overview` 待办口径一致，用 `safe_json`）。`owner`/`due` 若 todo 里没有就给 `""`；`urgent` 可按到期/优先级标记，无则 `false`。
- 无 todo → `{"items": []}`。

## 2. 风险看板 `GET /api/projects/{id}/risks`
- **响应**：`{ "items": [ { "level": "high" | "medium", "text": str } ] }`
- **真实数据源**：解析该项目**最新一条 `project_analyses`（task=`design_difficulty` 或 `project_overview`）** 的结构化结论里的风险项。拿不到结构化风险就返回空（不要从正文乱抽造数）。
- 无研判 → `{"items": []}`。

## 3. 可复用资产 `GET /api/projects/{id}/reusable-assets`
- **响应**：`{ "items": [ { "kind": str, "name": str } ] }`（kind 如 类比/方法/理论/Prompt）
- **真实数据源**：项目关联的知识文档按 `tags`/类型归类（与数据基地「可复用资产」同源）。无 → 空。

## 4.（可选）grid3 KPI 计数：扩 `/overview`
- 在已上线 `GET /api/projects/{id}/overview` 增 `risks: int`、`assets: int`、`gaps: int` 三个真实计数（risks=风险条数，assets=可复用资产数，gaps 暂无干净源就返回 `0` 或先不加）。
- ⚠️ 改 `ProjectOverviewOut` 时**只加字段不改既有**，前端 `ProjectOverviewSchema` 我同步加（前端 lane）。

## 5.（可选·低优先）城市/甲方 chips
- HTML ptitle 有 `城市 / 甲方` 角标，但 `Project` 模型无字段。若要点亮：Alembic 给 `projects` 加 `city: str=""`、`client: str=""`（nullable），并在 `ProjectOut` 暴露。前端拿到后渲染 chips；**没有就不渲染，不造数**。

## 6. 交付后
- 在 `docs/API_CONTRACT.md` 写各端点最终响应形状（哪怕和上面一致也确认一行）。
- Claude 据此把 `ProjectCenterPage.tsx` 的本地空数组替换为 `api.get*` 拉取（C1.2，前端 lane）。
- 建表/字段顺序遵守总纲 §7.3；本批最多只动 `projects` 加两列 + 复用既有 `meeting_minutes`/`project_analyses`/`knowledge_documents`，**不需要新建大量表**。

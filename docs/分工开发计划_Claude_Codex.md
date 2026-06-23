# ROM-AI 五板块点亮 · Claude × Codex 分工开发计划

> 生成：2026-06-23 | 权威目录：`C:\ROM-AI-Claude 开发`
> 依据：《五板块点亮·Claude 执行总纲(定稿)》+ HTML 五板块权威稿。
> 目标：两个 Agent 并行加速，**任务零文件冲突**。

---

## 0. 唯一冲突规避铁律：按「层」切，不按「板块」切

之前冲突发生在 Claude 与 Codex **同时改 `api.ts / schemas.ts / main.py`**。根因是两边都跨了前后端。本计划用**目录归属硬边界**根除：

| 归属 | 目录 / 文件 | 规则 |
|---|---|---|
| **Claude（前端）** | `frontend/**` 全部：五板块 page、组件、`lib/api.ts`、`types/schemas.ts`、`App.tsx`、CSS | Codex **绝不写**任何 `frontend/` 文件 |
| **Codex（后端）** | `backend/**` 全部：`routers/`、`models.py`、`schemas.py`、`alembic/`、`tests/`、`main.py` | Claude **绝不写**任何 `backend/` 文件 |
| **契约（Codex 维护）** | `docs/API_CONTRACT.md` | Codex 写端点契约，Claude 只读消费 |

**因为两边文件集不相交，同一文件永远只有一个写者 → 工作区不会被对方覆盖。**

**Git 纪律（两边都遵守）**：只用显式路径 `git add frontend/...` / `git add backend/...`，**永不 `git add -A`**；提交信息标注 `[FE]` / `[BE]`。单一本地仓库、同一工作树，不开远程；靠「文件集不相交」保证安全。

---

## 1. 同步机制：API 契约握手

1. **Codex 先在 `docs/API_CONTRACT.md` 公布端点契约**：路径 + 方法 + 响应 JSON 形状 + 空态/`not_configured`/`no_material` 语义。
2. **Claude 按契约写 `lib/api.ts` + `types/schemas.ts` 消费**。
3. 端点未就绪时，Claude 先按契约形状写页面，并显示**规范空态/loading（不塞 mock，遵守原则 13）**；端点上线后即真数据。
4. 已存在可直接用的真端点：`/api/projects`、`/api/projects/{id}/overview`(已上线)、`/api/projects/{id}/files`、`/api/projects/{id}/analyses`、`/api/projects/{id}/meetings`、`/api/skills`(已上线)、`/api/knowledge*`、`/api/workspace*`、`/api/settings`、`/api/chat*`。

> ⚠️ **给 Codex 的关键纠偏**：总纲 §7.2 说「Claude 版用 sqlite3」是**过期描述**。主工程实际是 **SQLAlchemy ORM**（`db.query(models.X)`）。新路由按现有 ORM 风格写，**不要**引 sqlite3 裸查、不引 V3 的 service 层（原则 8）。

---

## 2. Claude 前端轨（按用户优先级排序，小步快跑）

> 视觉一律对齐 HTML 权威稿（`.sec/.sechead/.metric/.kbrow/.tg` 等类名与卡片顺序），不重设计、不引 shadcn。每步跑 `tsc --noEmit` + 截图自检。

- **C1 项目中心 HTML 布局校准**（`ProjectCenterPage.tsx`）
  对齐 `#p-proj`：① ptitle 补 城市/阶段/甲方 chips；② grid2 用 HTML 的「下一步·里程碑」列表 + 「风险看板·可复用资产」tags 取代占位文案（接 B 系真端点，未就绪则空态）；③ 保留已上线 KPI grid（真计数）；④ 文件/研判/会议区块顺序与类名对齐。
- **C2 数据基地 HTML 布局重构**（`KnowledgePage.tsx`）★用户重点
  按 `#p-know` 的**可折叠 `.sec` 手风琴**重建：检索(searchwrap+scopebar) → 数据源 → 库存与健康(grid3) → 文件浏览(目录树) → 可复用资产(按类型分组) → 项目效果图(gallery，**未接生图空态·不伪造**)。**移除当前硬编码 mock 数据源/计数**，接 `knowledge`/`workspace` 真端点，无数据走空态。
- **C3 共创营地接线**（`AgentPage.tsx`）：6 技能卡硬编码 → 改 `fetch('/api/skills')`；积分徽标接 `credits`(B2)，Agent 列表接 `agents`(B7)；**保留真实 DeepSeek 对话**。
- **C4 协作平台**（`HubPage.tsx`）：团队卡接 `team`(B4)、智能助手接 `agents/designers`、走马灯接 `broadcast`(B6)；去 mock。
- **C5 管理驾驶舱**（`BossPage.tsx`）：dashboard/成员负载/风险告警/全员通知接 `boss`(B5)+`broadcast`；去 mock，登录门控诚实。
- **C6 状态角标**：五板块 nav 角标接 `status_map`(B1)。

## 3. Codex 后端轨（按 §6 + §7.3 建表序，read-only 优先）

> 全部 SQLAlchemy ORM；新表走 Alembic **可回滚**迁移（红线）；每路由带错误分支测试，对齐 57→ 基线全绿。建表序：TeamMember → DigitalEmployee → SkillCard → AgentRun → TeamAssignment → Broadcast → CreditTransaction。

- **B0** 写 `docs/API_CONTRACT.md`（先把 C1/C2 依赖的端点形状定下来）。
- **B1** `status_map`：五板块状态角标（read-only，最轻，先做）。
- **B2** `credits`：积分余额 + transactions（无真实账本 → 基础值/`not_configured`，不伪造）。
- **B3** `skill_cards`：技能**执行**链路（项目维度，叠加已上线 `/api/skills` 目录）+ 成果卡落库。
- **B4** `team`：TeamMember 模型 + read-only 列表。
- **B5** `boss`：read-only 聚合 dashboard（成员负载/告警，源自真实 project/meeting/analysis 数据，不造数）。
- **B6** `broadcast`：通知/走马灯。
- **B7** `agents`：Agent 目录（**不替换 chat.py**，仅目录）。
- **B8** `result_send`(preview/`not_configured`)、`tech_points`(并入 `project_analysis.py`，不单建)。

## 4. 同步里程碑

| 里程碑 | Claude | Codex |
|---|---|---|
| **M1** 项目中心+数据基地 HTML 还原 | C1, C2 | B0 契约, B1 status_map |
| **M2** 共创营地全亮 | C3 | B2 credits, B7 agents, B3 执行 |
| **M3** 协作+驾驶舱 | C4, C5 | B4 team, B5 boss, B6 broadcast |
| **M4** 角标+验收(§9) | C6 + 走查 | B8 + 测试全绿 |

## 5. 文件归属速查（冲突矩阵）

| 文件/区域 | 归属 |
|---|---|
| `frontend/src/pages/*.tsx`、组件、CSS | **Claude** |
| `frontend/src/lib/api.ts`、`types/schemas.ts`、`App.tsx` | **Claude** |
| `backend/app/routers/*.py`、`models.py`、`schemas.py`、`main.py` | **Codex** |
| `backend/alembic/**`、`backend/tests/**` | **Codex** |
| `docs/API_CONTRACT.md` | **Codex** 写，Claude 读 |
| `HANDOFF_CURRENT.md` | 各写各的板块行；改前先 `git pull`/看 diff，避免同段 |

## 6. 共同红线（两边都不得越）
原则 9–13：不伪造数据；无配置/无材料/无录制 → 明确状态码；空数据 → 空态不显 `—`、不塞 mock。已完成能力（§7.4 清单 + 4B–4E）不得重写，只接 UI / 轻量扩展。

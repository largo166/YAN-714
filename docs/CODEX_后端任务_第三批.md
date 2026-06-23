# Codex 后端任务 · 第三批（成果发送 / 会议回流 / 任务关联 / 阶段进度）

> Claude(前端)→ Codex(后端) 指令。与前两份 `CODEX_后端任务_*.md` 同款精度。
> 归属：全部 `backend/**`，**Codex 独占**；Claude 不碰后端。完成后在 `docs/API_CONTRACT.md` 记一行。
> 通用约束同前：SQLAlchemy ORM；新表/字段走 Alembic 可回滚迁移；不伪造(原则9/13)无数据 `{"items":[]}`/无配置 `{"status":"not_configured"}`；每端点配错误分支测试，对齐 pytest 全绿(当前 73 passed)。

---

## D1 · 成果发送 result_send（共创营地成果卡 → 发送）
- **先 preview/not_configured，不强行外发**（总纲 §6 result_send 口径）。本批**只做发送预览 + 渠道配置探测**，不真实发邮件/企微/微信。
- `GET /api/result-send/channels` → `{ "items": [ { "channel": "email"|"wecom"|"wx", "configured": bool, "label": str } ] }`
  - 未配置渠道 `configured=false`；前端据此置灰按钮 + 提示去设置页配置。
- `POST /api/result-send/preview` body `{ "content": str, "channel": str }` →
  - 渠道已配置：`{ "status": "preview", "rendered": str }`（返回将要发送的内容预览，不真发）
  - 渠道未配置：`{ "status": "not_configured", "channel": str }`
- **不建表**（无需持久化发送记录）；渠道配置读 AppSetting / .env，缺失即 not_configured。

## D2 · 会议待办 → 项目里程碑回流
- 目标：会议纪要 `todos`（人工确认 review_status=confirmed 后）回流为项目中心「下一步·里程碑」。
- 方案（复用现有，**免新表**）：`/api/projects/{id}/milestones`（已存在，C1）已聚合 minutes 的 todos。本批把它**收敛为只取 review_status=confirmed 的纪要**，并补一个回流动作端点：
  - `POST /api/projects/{id}/meetings/{meeting_id}/minute/{minute_id}/reflow` →
    把该纪要 todos 标记为「已入下一步」(在 MeetingMinute 加 `reflowed:bool` 或 todo 项加标记，Alembic 可回滚)；
    返回 `{ "status": "ok", "reflowed_count": int }`。
  - 幂等：重复调用不重复计数。
- milestones 响应形状**保持不变**（前端 C1.2 已接），仅数据来源口径收敛 + 多一个写动作。

## D3 · 成员 ↔ 任务关联（承担任务）+ 成员删除/停用
- **新表 `team_assignments`**（Alembic，§7.3 建表序 TeamAssignment）：`id` · `member_id→team_members` · `project_id→projects` · `task_title:str` · `due:str=""` · `created_at`。
- `GET /api/team/members` **扩展**：每个 member 加 `assignments: [ { "task_title": str, "due": str, "project_id": int } ]`（无则 `[]`）。
  - ⚠️ 只**加字段不改既有**，前端 TeamMemberSchema 我同步加。
- `POST /api/projects/{id}/team-assignments` body `{ "member_id": int, "task_title": str, "due": str }` → 创建分派。
- **成员删除/停用**（前端这轮要做，依赖你补）：`DELETE /api/team/members/{id}`（软删，status=trashed，永不硬删，遵守归档红线）。
  - 已有 POST/PUT，**只差 DELETE**，请补上。

## D4 · 阶段进度真实化（项目中心进度条/下一节点）
- 当前前端是静态 42%。真实来源：项目里程碑完成度 / 当前阶段。
- `GET /api/projects/{id}/progress` → `{ "pct": int, "next_node": str, "next_due": str }`
  - `pct`：按里程碑完成比例或阶段映射（active→规则定）；无数据返回 `pct=0, next_node=""`。
  - 不伪造：拿不到真实节点就空字符串，前端显「待接入项目里程碑」。

---

## 交付后
- `docs/API_CONTRACT.md` 写各端点最终响应形状。
- Claude 据此接前端：D1→共创营地成果卡发送、D3 assignments→协作平台「承担任务」+ 删除按钮、D4→项目中心进度条、D2→里程碑「已入下一步」标记。
- 本批新表仅 **team_assignments** 一张 + MeetingMinute 一个回流标记字段；其余复用既有表。建表序遵守 §7.3。

## 依赖标注（给 Claude）
- **D3 的 DELETE /api/team/members/{id} 是前端「成员删除/停用」的前置**——这一项 Claude 会先做录入/编辑(POST/PUT 已就位)，删除按钮待此 DELETE 出后接。

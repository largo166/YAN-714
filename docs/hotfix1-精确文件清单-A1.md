# hotfix1 精确文件清单（A-1 单一数据源）· 待过目后动手

> 定案：A-1 汇聚层单一数据源；加载显"…"、空库显真 0、失败显"—"+板内错误提示；并入 hotfix1 一次到位。
> 主题：数据基地首页 + 底部状态栏，全部数字绑真实数据库，消灭"同一数据两条路径"。
> 铁律：exe 从 commit 后干净工作区构建，验证=提交=发出同一份。

---

## 一、新增文件

### `hooks/useBoardLive.ts`（新）—— 汇聚层，单一数据源
- 在 AppShell 层常驻调用 `useKnowledgeLive(true)` / `useSkillsLive(true)` / `useHubLive(true)`（**active 恒 true**，保证冷启动停在 b0 时 b1-b3 数字已是真值，不是切板才拉）。
- 统一监听 `romai:knowledge-updated`：已在各 hook 内（useKnowledgeLive 已加；skills/hub 若需刷新一并加）——**汇聚层保证入库后状态栏与首页大字同帧变化**。
- 返回：`{ knowledge, skills, hub }` 三份 live（含各自 loading/err/数据），供 AppShell 状态栏 + 三个 board 共用。
- 三态：各 live 自带 loading/err，状态栏据此显 数字 / "…" / "—"。

## 二、改签名的文件（board 改为接收 live prop，删除自调 hook —— 消灭第二条路径）

### `components/boards/KnowledgeBaseBoard.tsx`
- 签名：`{ active }` → `{ active, live }`（`live: KnowledgeLive`）。
- **删** `const live = useKnowledgeLive(active)`（第16行）——改用传入的 `live`。
- 其余渲染逻辑不变（big/idxRate/cjk/typeStats/recent 都读 `live.*`）。
- A组的空态文案改动（第85行）**不在 hotfix**——那是 A组，走 stash。本文件 hotfix 只改"删自调 hook + 接 prop"。

### `components/boards/AgentCampBoard.tsx`
- 签名：现有 `{ projectId, projectName, onGoBoard, active }` → 加 `live`（`live: SkillsLive`）。
- **删** `const live = useSkillsLive(active)`（第77行）——改用传入 `live`。
- 注：A组已把 `useSkillsLive(true)→(active)`（第14/17任务）——现在直接删自调、改 prop，A组那处改动被本次覆盖（合理，同一目标的更彻底版）。

### `components/boards/HubBoard.tsx`
- 签名：`{ active }` → `{ active, live }`（`live: HubLive`）。
- **删** `const live = useHubLive(active)`（第14行）——改用传入 `live`。

## 三、AppShell.tsx —— 汇聚 + 状态栏真值

- 加 `const boardLive = useBoardLive()`（汇聚层）。
- 三个 board 调用点传入对应 live：
  - `<KnowledgeBaseBoard active=... live={boardLive.knowledge} />`
  - `<AgentCampBoard ... live={boardLive.skills} />`
  - `<HubBoard active=... live={boardLive.hub} />`
- **状态栏 statusLeft 改造**（第99-103行）：按 board 组装真值文案，保留原表达方式：
  - b0：`proj.cur.name · status`（已真，不动）
  - b1：`数据基地 · {knowledge.stats?.documents ?? (loading?'…':'—')} 篇受管`
  - b2：`共创营地 · {skills.loading?'…': skills.err?'—': skills.skills.length} 项技能在编`
  - b3：`协作平台 · {hub.loading?'…': hub.errs.length?'—': hub.members.length} 名成员`
  - b4：`管理驾驶舱 · 只读大盘`（非数字，保留）
- pulse：数字加载中时可给状态栏加 pulse（沿用已有）。

## 四、constants.ts BOARD_STATUS
- b1/b2/b3 不再由 BOARD_STATUS 提供（改由 AppShell 动态真值组装）。
- BOARD_STATUS 保留作**兜底/b4**：b4 用 `管理驾驶舱 · 只读大盘`；b0-b3 的静态值实际不再显示（被动态覆盖），但为防漏留中性兜底文案（不含假数字）。

## 五、CleanupWizard.tsx（hotfix 部分）
- 已改：SSE finished 标志（不误报红字）+ 入库完成 dispatch `romai:knowledge-updated`。
- P0 回退清 staging（已在 f5a88c8 提交）——reset 后整文件归 hotfix1（你已定：CleanupWizard 整文件进 hotfix，不给 A组留改动）。

## 六、useKnowledgeLive.ts（hotfix 部分，已改）
- 去 `loaded` flag → `ver` 驱动可刷新 + 监听 `romai:knowledge-updated`。
- **需补**：确认 useSkillsLive/useHubLive 是否也要监听事件（技能/成员一般不随入库变，可不监听；但为统一，评估是否加——**倾向不加**，技能/成员由各自 CRUD 动作刷新，入库事件只关知识库）。

---

## 七、验证（打包形态，冷启动新增一条）
1. exe 空库启动，**停在项目中心不切板** → 状态栏五条：b0 项目名、b1「0 篇受管」、b2「N 项技能在编」(真技能数)、b3「0 名成员」或真成员数、b4「只读大盘」——**无一条静态假文案，数字全真或"…"落真**。
2. 向导 ingest 8 → 关抽屉回首页免刷新：大字 8 **且状态栏 b1「8 篇受管」同帧变**。
3. 无红字；重启 exe 仍 8；二次导入 skipped=8 不翻倍。
4. 全局 grep 确认三个 board 无残留自调 hook（`useKnowledgeLive(`/`useSkillsLive(`/`useHubLive(` 只在 useBoardLive 内出现一次）。

## 八、git 重排序（reset --soft，你已批乙案）
1. stash 非 hotfix/非 b1（A组：其他板 polish + KnowledgeBaseBoard 空态 + 测试基建 + package*）。
   - ⚠️ 注意：本次 A-1 会改 KnowledgeBaseBoard/AgentCampBoard/HubBoard 签名（属 hotfix），而 A组也改这些板（空态文案属 A组）——**同文件冲突**。按你定"CleanupWizard 整文件进 hotfix"的同理，**这三个 board 的签名改动属 hotfix，空态文案属 A组**。若难分离，同样降级：**board 整文件进 hotfix**，A组的空态文案 reset 后重做（A组阶段再加）。
2. reset --soft main → 落 ⓪gitattributes+gitignore → ①b1链路 → ②hotfix1（含 useBoardLive + 三 board + AppShell + CleanupWizard + useKnowledgeLive + constants）。
3. A组 stash：其他板(ProjectCenter/CockpitBoard 空态、AppShell 加载语言/aria) + 测试基建。

## 九、B④ 账目更新（你已定）
A-1 实质完成 B④ 对 knowledge/skills/hub 三 hook 的统一核心。backlog B④剩余范围改写为：
- reload/重试按钮补齐 + 失败态 UI 统一 + useProjectLive 是否并入汇聚层的评估。
- 不重复立项。

---

## ⚠️ 需你拍板的两个执行细节
- **(a) 三个 board 同文件冲突**（签名改动=hotfix vs 空态文案=A组）：像 CleanupWizard 一样**整文件进 hotfix、A组空态 reset 后重做**？（我倾向是——避免 hunk 手术，与你 CleanupWizard 的裁决一致）
- **(b) useSkillsLive/useHubLive 要不要也监听 `romai:knowledge-updated`**？（我倾向不加——技能/成员不随入库变，入库事件只刷知识库；技能/成员由各自 CRUD 刷新）

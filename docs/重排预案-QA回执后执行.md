# 重排预案 · QA 回执后一次成型（2026-07-07）

> 状态：**无损准备完成，等张文"验证通过"（锚 BUILD `a24b71f290d4`）后你一句"执行重排"→ 我照此一次成型，不再中间确认。**
> QA 期间**分支冻结**：除 QA 发现的修复（作为新 commit 叠加在现有三笔之上，重排时一并归位）外，不进任何新改动。

---

## 一、目标 commit 结构（写死）

```
main
 └─ (0) chore: .gitattributes(LF) + .gitignore(运行产物)         ← 基建笔
 └─ (1) feat: b1 入库链路(pre-existing, 未经本批评审)              ← 功能单元:前端向导重写+后端staging/ingest+api+FolderPicker+spec+DB地基
 └─ (2) feat: 三态诚实 A组5项 + 测试基建                          ← 本批改动
 └─ (?) chore: 归档留存文档到 docs/                               ← 见§四,清单待你扫
 └─ (?) 【拿不准】下拉定位重构(Modal.DropMenu + 2消费者)          ← 见§三,归属待你拍
```

每笔验收标准：**单独 checkout 该 commit，`cd frontend && npm run typecheck` 可过**（后端笔另需 `python -c "import app.main"` 不报缺模块）。

> 现分支已有 3 笔（`e679db7` gitattributes / `65035ef` 重写 / `f5a88c8` A组）。重排=把「重写笔」拆开、并入后端 staging/ingest/api/FolderPicker/spec/DB 成①这一个功能单元笔；gitattributes 并入 .gitignore 成基建笔⓪；A组保持为②。用 `git reset --soft main` 退回暂存区后按①②重新分笔提交最稳（工作区文件不动，只重组 commit 边界）。

---

## 二、工作区未提交改动 · 逐文件归属（重点）

### → 进 commit ①「b1 入库链路」（已核 diff 确认相关）
| 文件 | 状态 | 归此依据(实读 diff) |
|---|---|---|
| `frontend/src/seasky/components/data/CleanupWizard.tsx`（**减 P0 部分**） | M | 向导重写主体（CleanupPreview/apply → staging/ingest/SSE）。P0 那 12 行归②。 |
| `backend/app/routers/staging.py` | ?? | staging 收料单端点(链路铁条2) |
| `backend/app/routers/ingest.py` | ?? | ingest 启动+SSE 端点(链路铁条3) |
| `backend/app/ingest.py` | ?? | ingest 五段编排器 |
| `backend/app/main.py` | M | `include_router(staging/ingest)`——挂载链路 |
| `backend/app/schemas.py` | M | `StagingIn/StagingOut/IngestStartOut` 等链路契约 |
| `backend/app/config.py` | M | `REPOS_ROOT`+`_ensure_repos_root()`——入库落点(检查点0·D1) |
| `backend/app/database.py` | M | 启动跑 alembic upgrade + DB 备份(检查点0 地基,链路依赖) |
| `frontend/src/lib/api.ts` | M | `staging()/ingestStart()/listDir()` 等前端调用封装 |
| `frontend/src/components/FolderPicker.tsx` | M | 向导选目录组件(深色化+list-dir 降级,链路的选取入口) |
| `frontend/src/seasky/components/system/SettingsOverlay.tsx` | M | `repository_root_path`/`inbox_root_path` 设置 UI(链路配置面) |
| `desktop/romai.spec` | M | 打包规格(打进 alembic/staging/ingest,链路交付载体) |

### → 进 commit ②「A组5项+测试基建」（本批，已在 f5a88c8）
CleanupWizard 的 P0 goBack(12行) + AgentCampBoard/CockpitBoard/KnowledgeBaseBoard/ProjectCenterBoard/AppShell/TopNavCapsules/globals.css + vitest.config.ts/src/test/setup.ts/CleanupWizard.test.tsx/package.json/package-lock.json。

### → 进 commit ⓪「基建」
`.gitattributes`(已提交 e679db7) + `.gitignore`(本次新改，M)。

### → 进「文档 chore 笔」（见§四）或保留原位
`CLAUDE.md`、`MEMORY.md` + §四清单里判为"留存"的。

---

## 三、⚠️ 拿不准归属 —— 现在就请你拍（不留到重排当天）

**下拉定位重构（一个独立 pre-existing 单元，不属 b1 链路）：**
| 文件 | 改动(实读) |
|---|---|
| `frontend/src/seasky/components/common/Modal.tsx` | `DropMenu` 加 `placement`/`gap` prop API（110 行重构） |
| `frontend/src/seasky/components/agent/ModelSelector.tsx` | 改用 `placement="top-right" gap={10}`（弃旧 className 定位，3行） |
| `frontend/src/seasky/components/project/ProjectSwitcher.tsx` | 改用 `placement="bottom-left" gap={16}`（4行） |

**问题**：这三个是一组原子改动（DropMenu 新 API + 两个消费者迁移），**与 b1 入库链路无关**，也不是本批 A 组。放进 commit①（b1 链路）会名不副实。

**请你选一（重排当天照此执行，不再问）：**
- **(A)** 单独成一笔 `refactor: DropMenu placement API (pre-existing)`，插在 commit① 前或后；
- **(B)** 并入 commit①（接受"b1 链路笔"含一点无关重构，图省事）；
- **(C)** 不提交，留 working tree（跟其它未列入的一样先搁着）。
> 我的建议：**(A)**——它是完整独立单元，单独一笔最干净，且单独 checkout 能过 typecheck。

---

## 四、② 散落文档清单 + 去留建议（请扫一眼）

> 建议统一：留存价值文档挪 `docs/` 后**单独一笔 chore commit**；分析草稿/预览 HTML 视价值删或留原位。**这批我不擅自删/移，等你圈定。**

| 文件 | 行数 | 性质 | 建议 |
|---|---|---|---|
| `moa_architecture_design.md` | 630 | MoA 架构设计 | 挪 docs/ 留存 |
| `camp_moa_implementation_plan.md` | 620 | 营地+MoA 实施方案 | 挪 docs/ 留存 |
| `analysis_six_nodes_design_firms.md` | 911 | 六节点设计分析 | 挪 docs/ 留存 |
| `国内建筑设计事务所前期方案工作模式研究报告.md` | — | 行业调研 | 挪 docs/ 留存 |
| `sharpness_chain_analysis.md` | 248 | 差异化锻造链分析 | 挪 docs/ 留存(或删,若已废) |
| `camp_backend_closure_analysis.md` | 263 | 营地后端收口分析 | 挪 docs/ 留存 |
| `camp_audit_design_thinking.md` | 169 | 设计公司审计报告 | 挪 docs/ 留存 |
| `splash_design_doc.md` | 260 | EXE 启动动画方案 | 挪 docs/ 留存 |
| `检查点0-①实施清单.md` / `检查点①-三铁条落地方案.md` | — | b1 链路实施清单 | 挪 docs/ 留存(与①链路配套) |
| `交接-下次启动.md` | — | 会话交接 | 留存(挪 docs/ 或保留原位) |
| `plan.md` | 31 | 疑似 analysis 草稿残页(首行同六节点) | **建议删**(与 analysis_* 重复) |
| `project_center_design.html` | 861 | 项目中心设计稿 HTML | 原型类:挪 prototypes/ 或删 |
| `review_moa_demo.html` | 468 | MoA demo 预览 | 原型类:挪 prototypes/ 或删 |
| `splash_preview.html` | 450 | 启动动画预览 | 原型类:挪 prototypes/ 或删 |
| `prototypes/*.html` | — | 已在 prototypes/ 的视觉母版/基线 | **保留原位**(设计规格,记忆已引) |
| `CLAUDE.md` / `MEMORY.md` | — | 工程铁律索引 / 记忆索引 | **提交**(随基建或单独笔,你定) |

> 说明:`release-internal/`、`.tmp_run_logs/`、`_tmp_*/`、`*.lnk` 已由本次 .gitignore 纳入,不在上表,不入库。

---

## 五、③ backlog 落账

**新任务：入库链路自动化烟测**
- 内容：staging → ingest → 显示 的最短路径断言（自动化）——补齐 §二 commit① 那条链路当前"仅人工 QA"的缺口。
- 形态：按 CLAUDE.md 选型，接口契约走 **API 断言**（Python urllib/httpx 直连，精确 UTF-8 body，勿 shell curl），显示层若涉状态可加组件测试。
- 触发：下个迭代（B④⑤ 之后或并行）。
- 依据：重写随批合入的前提 b)——"合入不等于豁免,验证方式先人工后自动"。
- 已在 TaskCreate 登记（见任务列表）。

---

## 六、重排当天执行序（照此，一次成型）

1. `git reset --soft main`（退回暂存区，工作区文件不动）。
2. 暂存 §二①清单 → 提交 commit①（message: `b1 ingest chain, pre-existing before polish batch, 未经本批评审, 验证依据=BUILD a24b71f290d4 打包形态人工 QA`）。
3. 暂存 §二②清单（含 CleanupWizard P0 12行 + 测试基建）→ 提交 commit②。
4. 暂存 `.gitattributes`+`.gitignore` → 提交基建笔⓪（或置于最前，用 rebase 调序）。
5. §三拿不准项按你(A/B/C)处理；§四文档按你圈定挪 docs/ 后单独 chore 笔。
6. 每笔 `git stash` 后单独 checkout 验 `npm run typecheck` 过 → 全绿即推送/合并。
7. 若 QA 期间有修复 commit 叠在现有三笔上：reset --soft 会一并纳入暂存区,按归属并进对应笔,不单独留。

> 顺序细节(⓪ 在前还是后)不影响功能,合并前用 `git rebase -i` 调成 ⓪→①→② 阅读序即可。

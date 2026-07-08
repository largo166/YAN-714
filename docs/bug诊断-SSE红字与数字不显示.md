# 两个 bug 诊断 + 修复方案（2026-07-07，待批·未改代码）

> 状态：**只诊断定位，未改代码**（分支 QA 冻结期）。修复由你决定并入 QA 修复（叠现有三笔）或另开。
> 验证形态：结论均在 **打包/dist 同源形态**取得（新规③：数据源/origin/SSE 一族禁 dev 下结论）。exe = `dist_exe/ROM-AI.exe`。

---

## Bug 1：执行后总显示红字「进度流中断(job 可能已完成…)」

### 现象
每次点「开始入库」跑完，都弹红色「进度流中断(job 可能已完成,请查看数据基地最近入库)」——即使入库其实成功了。

### 根因（打包形态机制级确认）
- 后端 SSE（`routers/ingest.py:47-61`）：推完事件 → 发 `{kind:"eof"}` → `return`，**服务端主动关闭连接**。
- 前端（`CleanupWizard.tsx:123-135`）：`onmessage` 收到 `eof` 会 `es.close()`；但 **`EventSource` 规范：服务端关闭连接=浏览器视为断线→触发 `onerror`**。
- **竞态**：`onerror` 与 `eof` 的 `onmessage` 抢跑。实测"总是显示"= `onerror` 稳定赢——`es.onerror`(:132) 无条件 `setErr('进度流中断…')`。
- 即：**这是把"正常完成的流关闭"误判成"错误"**。属"入库显示不出"同族（SSE/流终止误报）。

### 影响范围
- 同事装的内测包 exe（打包于 07-06 12:12）里 CleanupWizard 是重写版但**无本批修改**，此红字逻辑与现状一致——所以同事也会遇到。
- 现 dist（`a24b71f290d4`）仍有此逻辑，**A 组未触及此处**（A 组只改了 goBack/空态/加载语言，没动 SSE 收尾）。

### 修复方案（三选一，建议 A）
- **(A) 前端加"完成"标志位，onerror 只在未完成时报错**（推荐，最小改动，不动后端契约）：
  - `doIngest` 内引入 `let finished = false`；`onmessage` 收到 `eof`/`done` 时置 `finished=true`。
  - `onerror` 改为：`if (!finished) setErr('进度流中断…')`（已完成的正常关闭不再误报）。
  - 更稳妥：收到 `receipt`(done 事件) 即认定成功，`onerror` 后若已有 receipt 就静默。
- **(B) 后端 eof 后不立即 return，加短延迟/心跳**：治标，仍可能竞态，不推荐。
- **(C) 后端发完 eof 主动保持连接由前端关**：改动大，不推荐。

> 修复后验证：属"状态/交互逻辑+SSE 收尾"——**组件测试**（mock EventSource 发 eof 后触发 onerror，断言不 setErr）+ **打包形态人工确认**红字不再出现。

---

## Bug 2：同事本地装 ROM-AI 后，数据基地数字不显示

### 先回答你的问题：数字是真实读取的吗？
**是，完全真实，无伪造。** `GET /api/knowledge/stats`（`routers/knowledge.py:47-80`）：
- `documents = len(docs)`：真查 `KnowledgeDocument` 表（排除 cross_project/reflow 派生条目）。
- `indexed`：真查 FTS5 表 `SELECT COUNT(*) FROM knowledge_documents_fts`。
- `chunks`/`cjk_chunks`：真遍历每篇 `content_text` 切块 + 中文正则统计。

### ★ 真根因（打包形态已复现，2026-07-07 更正）
> 我第一版判"空库"是**错的**。张文新信息："能检索到入库信息，但没法显示，之前网页端可用"+截图大字="0"、索引完成率/资料类型="—"。这不是空库，是**有数据但 stats 数出 0**。

**根因 = 后端两个端点数据口径不对称：**
- `knowledge_stats` 统计时 **`file_type.notin_(_DERIVED_FILE_TYPES)`** —— 排除派生条目（`cross_project` / `reflow_analysis` / `reflow_minute`，即跨项目沉淀/回流成果）。
- `retrieval.search`（`retrieval.py:311`）搜 `knowledge_documents_fts`，**不按 file_type 过滤** —— 派生条目照样命中。
- → **同一篇派生类型文档：检索找得到，统计不计入。** 张文库里有这类派生/回流文档（或其入库产出被归派生类型），于是大字按"常规库"口径显示 0/偏低，检索却能命中全部。

**打包形态复现（当前 exe 实测）：**
| 动作 | stats.documents | search '襄阳' 命中 |
|---|---|---|
| 插 1 篇正常 + 1 篇 `file_type=cross_project` | **1**（排除 cross_project） | **1**（命中的正是被排除那篇"跨项目沉淀-襄阳"） |

即 stats 少数、search 全命中——**与张文现象一致，根因确认。**

### 这是真 bug（非空库、非纯前端 render）
- 在**当前 exe** 就能复现（不依赖张文旧版）。
- 前端 `KnowledgeBaseBoard.tsx:28`：`big=stats?String(documents):...`——stats 正常返回、documents 真是 0/低，前端如实显示，前端无错。
- 后端 API base/origin 在打包形态正确（已验 200）。**问题在后端两端点口径不一致，不在前端、不在 origin。**

### 修复方案（三选一，需你定口径——这是产品语义问题）
**先厘清"数据基地大字"应代表什么：**
- **(A) 大字 = 全部可检索到的知识条目（含派生）** → 改 `knowledge_stats` **去掉 `_DERIVED_FILE_TYPES` 排除**，与 search 口径对齐。最直观："能搜到的都算数"。风险：跨项目沉淀/回流成果会计入"记忆底座"总数（原设计有意分开,见 knowledge.py:31-33 注释）。
- **(B) 保持大字=常规库（不含派生），但让 search 也排除派生** → 两端口径都收窄到"常规库"。风险：检索不到派生成果,可能不符预期（回流成果本就想被检索到）。
- **(C) 大字仍=常规库,但补一个"含派生"的说明/副数字** → 既不误导"能搜到却不计",又保留原分层。改动最大。

> **我倾向 (A)**：张文的心智模型是"入库了就该显示",能检索到的就该计入大字——口径对齐 search 最符合直觉,且改动最小（stats 去一个 filter）。但**这是产品语义,你拍板**。
> 注意：无论选哪个,**还要看张文库里那些派生条目是"入库正常产出"还是"本不该是派生类型"**——若是后者(入库误标),根在打标处,另议。需张文 launcher.log / 库快照佐证他的派生条目来源。

### 修复后验证
属"接口契约/数据口径"——**API 断言**（打包形态:插正常+派生文档,断言 stats 与 search 口径一致）+ backlog#24 的入库链路自动化烟测覆盖。**须打包形态复现确认。**

---

## 建议处理次序（都在 QA 冻结约束内）
1. **Bug 1（SSE 红字）**：根因明确、修复小（前端 finished 标志）、且同事内测包也中招——**已修**（`CleanupWizard.tsx` doIngest 加 finished 标志，onerror 仅 !finished 报错）。作为**第 4 笔 QA 修复**叠现有三笔，重排时归 QA 修复组。待打包形态跑一次完整 ingest 验证（eof 正常关无红字 + 真断线仍报）。
2. **Bug 2（能检索却显示 0）**：**真根因已复现**=stats 排除派生类型 / search 不排除,口径不对称。修复=**口径对齐(A/B/C 待你定产品语义)**,我倾向 (A) stats 去派生排除。另需张文库快照/log 确认其派生条目来源(正常产出 vs 入库误标)。**不在 QA 冻结里擅自改**——等你定口径。

> Bug1 已改代码(在冻结里,属 QA 修复,你已授权"现在修")。Bug2 只诊断未改(涉产品语义,待你拍口径)。

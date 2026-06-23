# Codex 后端任务 · 第四批（项目级检索 + 技能执行链路）

> Claude(前端)→ Codex(后端) 指令。与前三份 `CODEX_后端任务_*.md` 同款精度。
> 归属：全部 `backend/**`，**Codex 独占**；Claude 不碰后端。完成后在 `docs/API_CONTRACT.md` 记一行。
> 通用约束同前：SQLAlchemy ORM；新表/字段走 Alembic 可回滚迁移；不伪造(原则9/10/13)——无 key 返 `not_configured` 不伪造回答，无材料返 `no_material`，空结果返 `{"items":[]}`；每端点配错误分支测试，对齐 pytest 全绿(当前 78 passed)。
> 这两块是《执行纲要 v2》Phase 5（AI 代理执行台）+ Phase 6（项目级检索）的核心，价值最高。

---

## E1 · 项目级知识检索（梳理第 5 点）

**现状**：`retrieval.search(db, query, top_k)` 检索**全知识库**，不分项目。共创营地开启知识库时会混读其他项目资料。

**目标**：检索可限定在「当前项目」范围内——只返回该项目自己的文件所索引的知识文档。

**关联关系（已存在，无需建表）**：
`ProjectFile.project_id` + `ProjectFile.indexed_doc_id(>0)` → `KnowledgeDocument.id`。
即：一个项目的知识文档 = 该项目所有 `status='active' 且 indexed_doc_id>0` 的 ProjectFile 指向的 doc id 集合。

**改动**：
1. `retrieval.search` 增加可选参数 `project_id: int | None = None`：
   - `None` → 现状全库检索（不破坏现有调用）。
   - 给定 → 先取该项目的 doc id 集合，检索结果 `WHERE document_id IN (...)`；项目无任何已索引文档 → 返回空列表（不报错）。
2. **chat 端点支持项目范围**：`SendMessageIn` 增 `project_id: Optional[int] = None`（只加字段不改既有）。开启 `use_knowledge` 且带 `project_id` 时，检索按项目范围；不带则全库（保持兼容）。
3. **knowledge search 端点同步**：`POST /api/knowledge/search` 的 `KnowledgeSearchIn` 增 `project_id: Optional[int] = None`，语义同上。

**响应形状不变**（前端 chat/search 已接），仅多一个可选入参 + 检索范围收敛。前端我在 `SendMessageIn`/`KnowledgeSearchIn` 同步加可选字段。

**验收**：给项目 A 导入资料、项目 B 导入资料，带 `project_id=A` 检索 B 的关键词 → 命中为空或不含 B 专属内容。

---

## E2 · 技能执行链路（梳理第 7 点，Phase 5 核心）

**现状**：`/api/skills` 只返回 6 个技能目录（展示用），点击技能卡只把示例填进输入框，**不真正执行产出成果**。

**目标**：技能卡可被执行，产出结构化「成果卡」。复用现有 `analysis.py` 的 `task→prompt` 模式 + DeepSeek（`llm.py`），**围绕当前项目 + 知识库检索**生成（规则 3：判断类输出必须基于真实材料 + 带出处）。

**新端点** `POST /api/projects/{project_id}/skills/{skill_id}/run`：
- body：`{ "input": str = "" }`（可选用户补充指令）
- 行为：按 skill_id 取内置 prompt 模板 → 用项目材料(已解析文件) + 项目级知识检索(E1) 组 RAG 上下文 → 调 DeepSeek → 返回成果。
- **响应** `SkillRunOut`：
  ```
  {
    "skill_id": str,
    "status": "ok" | "not_configured" | "no_material" | "error",
    "title": str,            // 成果卡标题，如「PPT 大纲」
    "content": str,          // 成果正文(markdown)
    "sources": [ { "kind": str, "ref_id": int, "title": str, "snippet": str } ],  // 出处,复用 AnalysisSourceOut
    "model": str,
    "error_message": str
  }
  ```
- **不配 key → `not_configured` 不伪造**；项目无材料 → `no_material`。

**技能 prompt 模板**（内置，6 个，对齐 `/api/skills` 的 id）：
| skill_id | 标题 | 是否需 RAG | prompt 要点 |
|---|---|---|---|
| `ppt` | PPT 大纲 | 是 | 基于项目材料生成方案汇报 PPT 大纲(页级标题+要点) |
| `review` | 方案评审 | 是 | 基于材料+知识库类比案例做方案评审,列优点/问题/建议 |
| `task` | 任务安排 | 是 | 基于材料拆解任务清单(标题/负责角色/优先级/建议时序) |
| `compete` | 竞品分析 | 是 | 从知识库检索类比项目,做对标分析 |
| `meeting` | 会议纪要要点 | 否(或用会议材料) | 已有五段式纪要链路,此处可生成要点摘要 |
| `img` | 生图提示词 | 否 | 生成 AI 生图 prompt(不真生图,Phase 7);纯文本提示词 |

**成果落库（可选，本批可后置）**：若要成果卡持久化+回流知识库，加 `skill_results` 表(project_id/skill_id/title/content/sources_json/created_at)。**本批先做"执行即返回"，落库可作为 E2.2 下一刀**——先不建表，避免一次性铺大。

**不自动串跑**（规则 9 / 开发顺序）：每个技能独立执行，下游(PPT→概念→生图)做成成果卡上的「建议下一步」入口，由用户逐个触发，后端不从一句话跑完整条流水线。

---

## 交付后
- `docs/API_CONTRACT.md` 写 E1 的可选入参 + E2 的 `SkillRunOut` 形状。
- Claude 接前端：
  - E1 → 共创营地发消息带 `project_id`（当前已传 knowledge_query，改为传 project_id 收敛范围）；数据基地检索可加「限本项目」开关。
  - E2 → 技能卡点击从「填输入框」升级为「执行→成果卡渲染(标题/正文/出处)」+「建议下一步」入口。
- 建表：E1 零新表；E2 本批零新表(执行即返回)，落库留 E2.2。
- 依赖顺序：**E1 先于 E2**（E2 的 RAG 依赖 E1 的项目级检索）。

## 给 Claude 的同步备忘
- E1 落地后我在 `SendMessageInput`/`KnowledgeSearchIn` 前端类型加 `project_id?: number`，chat 调用把 `cur.id` 传进去。
- E2 落地后技能卡 grid 每张加「执行」态 + 成果卡区真实渲染(替代当前占位)。

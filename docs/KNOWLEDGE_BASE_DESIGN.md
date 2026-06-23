# KNOWLEDGE_BASE_DESIGN — 知识库设计（Phase 4B）

## 数据库表
- `knowledge_documents`：id / title / source_path / content_text / file_type / tags(逗号分隔) / created_at / updated_at。
- `knowledge_documents_fts`：FTS5 虚拟表（title, content_text, tags），独立内容（非 external-content），由代码自行维护同步。

## 检索引擎（FTS5 优先，LIKE 兜底）
- `app/retrieval.py`：启动探测 FTS5 是否可用（本机实测**可用**）。
- 可用 → 短语 MATCH + `bm25()` 排序（score 取负 bm25，越大越相关），返回 engine="fts5"。
- 不可用 / FTS 异常 → `ILIKE %q%` 兜底，engine="like"。
- 增删文档时同步维护 FTS（index_one / remove_one）；`reindex` 全量重建。

## 接口
- `GET/POST /api/knowledge/documents`、`GET/DELETE /api/knowledge/documents/{id}`
- `POST /api/knowledge/search`：body `{query, top_k}`；返回 `{query, engine, hits[]}`，每 hit = `{document_id, title, snippet, score, matched_text, engine}`。
- `POST /api/knowledge/reindex`：返回 `{reindexed, engine}`。

## 带知识库的对话
- chat 接口 `use_knowledge=true` → 先 `retrieval.search` → 片段作为 system 上下文给 AI。
- key 未配 → 返回 `knowledge_hits` + assistant not_configured（检索结果照常给，AI 结论不伪造）。

## 前端接入（KnowledgePage / 数据基地）
- 搜索栏（FTS5·BM25 标）、命中列表（score + snippet，原 `.hit` 样式）。
- 知识文档区：新增文本知识表单、文档列表（`.kbrow`）、详情弹窗（`.modal`）、删除、重建索引。

## 边界
- 不引入向量库 / 对象存储 / 复杂 RAG 框架（符合纲要 OFF 清单）。
- 本地文件夹批量导入文档 → 归到 4C/4D（需目录授权）。

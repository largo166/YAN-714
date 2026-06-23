# API_MIGRATION_MAP — 后端接口清单与前端接入位置

> 已实现 ✅ / 待实现 🔌

## 已实现接口

| 方法 | 路径 | 用途 | 前端接入位置 |
|---|---|---|---|
| GET | `/health` | 健康检查 | App.tsx（顶栏在线态 + 不可达页） |
| GET | `/api/projects` | 项目列表 | ProjectCenterPage 下拉/KPI |
| POST | `/api/projects` | 新建项目 | （API 就绪，UI 待 4D 表单） |
| GET/PUT/DELETE | `/api/projects/{id}` | 详情/改/删 | （API 就绪） |
| GET/PUT | `/api/settings` | 设置读写（key 脱敏返回 key_set） | SettingsDrawer「AI 引擎与密钥」 |
| POST | `/api/chat/sessions` | 新建会话 | AgentPage 新建会话 |
| GET | `/api/chat/sessions` | 会话列表 | AgentPage 会话 chip |
| GET | `/api/chat/sessions/{id}` | 会话详情(含消息) | AgentPage 打开会话 |
| DELETE | `/api/chat/sessions/{id}` | 删会话 | （API 就绪） |
| POST | `/api/chat/sessions/{id}/messages` | 发消息(含 use_knowledge) | AgentPage 发送 |
| GET | `/api/knowledge/documents` | 文档列表 | KnowledgePage 文档库 |
| POST | `/api/knowledge/documents` | 新增文档 | KnowledgePage 新增表单 |
| GET | `/api/knowledge/documents/{id}` | 文档详情 | KnowledgePage 详情弹窗 |
| DELETE | `/api/knowledge/documents/{id}` | 删文档 | KnowledgePage 删除 |
| POST | `/api/knowledge/search` | FTS5/LIKE 检索 | KnowledgePage 搜索栏 |
| POST | `/api/knowledge/reindex` | 重建索引 | KnowledgePage 重建索引按钮 |
| POST | `/api/projects/{id}/files` | 上传文件(multipart)+同步解析 | ProjectFilesPanel 拖拽/选择上传 |
| GET | `/api/projects/{id}/files` | 文件列表(active) | ProjectFilesPanel 列表 |
| GET | `/api/projects/{id}/files/{fid}` | 文件详情+预览(content_text) | ProjectFilesPanel 预览 |
| DELETE | `/api/projects/{id}/files/{fid}` | 软删(移 _trash + manifest) | ProjectFilesPanel 删除 |
| POST | `/api/projects/{id}/files/{fid}/restore` | 恢复(按时间戳) | （API 就绪，可恢复） |
| POST | `/api/projects/{id}/files/{fid}/index` | 回流入库(写 knowledge_documents) | ProjectFilesPanel 入库按钮 |
| POST | `/api/projects/{id}/analyze` | AI 研判(5任务+RAG结构化sources+三态) | ProjectAnalysisPanel 5 按钮 |
| GET | `/api/projects/{id}/analyses` | 研判历史 | ProjectAnalysisPanel 历史 |
| GET | `/api/projects/{id}/analyses/{aid}` | 研判详情 | （API 就绪） |
| GET | `/api/projects/{id}/analyses/{aid}/export.md` | 导出 Markdown | ProjectAnalysisPanel 导出按钮 |
| POST | `/api/projects/{id}/meetings` | 创建会议(贴记录文本) | MeetingPanel 创建 |
| POST | `/api/projects/{id}/meetings/material` | 上传材料(txt/md/docx/pdf)建会议 | MeetingPanel 上传材料 |
| GET | `/api/projects/{id}/meetings` | 会议列表 | MeetingPanel |
| GET | `/api/projects/{id}/meetings/{mid}` | 会议详情 | MeetingPanel |
| POST | `/api/projects/{id}/meetings/{mid}/minute` | 生成五段式纪要(三态) | MeetingPanel 生成纪要 |
| POST | `.../minute/{id}/confirm` | 人工审定 | MeetingPanel 审定 |
| GET | `.../minute/{id}/export.docx?variant=external\|internal` | Word 正式导出 | MeetingPanel 导出 Word |
| GET | `.../minute/{id}/print` | 打印友好 HTML(保存PDF) | MeetingPanel 打印 |
| GET | `.../minute/{id}/export.md` | (隐藏调试)MD 导出 | — |
| POST | `.../meetings/{mid}/tencent` | 创建真实腾讯会议(confirm二次确认) | MeetingPanel 创建腾讯会议 |
| POST | `.../meetings/{mid}/tencent/sync` | 会后同步腾讯纪要/转写 | MeetingPanel 同步纪要 |
| GET | `/api/projects/{id}/slang` | 甲方诉求翻译器查询 | （API 就绪） |

## 待实现接口（按 Phase）

| Phase | 接口（建议） | 用途 |
|---|---|---|
| 4F | `/api/projects/{id}/image-*-slots`、`/api/image-gen` | A2 生图+成果 |
| 4G | `/api/admin/login`、`/api/boss/dashboard`、`/api/team` | 管理舱/协作平台 |

## 前端 API client
统一在 `frontend/src/lib/api.ts`，Zod 运行时校验（`types/schemas.ts`）。页面不散落 fetch。

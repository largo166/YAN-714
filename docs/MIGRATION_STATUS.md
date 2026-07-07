# MIGRATION_STATUS — ROM-AI 真实功能接入 总状态表

> 持续更新。状态取值：未开始 / 进行中 / 已完成 / 测试通过 / 阻塞待授权 / 阻塞待密钥 / 暂缓 / 废弃。
> 最近更新：4E 会议成果交付中心 MVP 完成（2026-06-22）。后端 pytest 55 passed，前端 build/typecheck/lint 通过。腾讯会议 provider 端到端验证(真实建会议+取消)。
>
> **验证记录更正（2026-07-07，活文档留痕）：** 4B 知识库此前记"FTS5 近千篇检索正常"——**该结论只覆盖元数据层**(记录/content_text/FTS5，检索靠库内文本，与盘上文件在否无关)。**物理文件层当时未验**。完整性校验(storage_probe 四态体检)就绪后补验：拿归档死库(archived-devlib，870 记录)体检 → **detached=870，精准归因 2 个脱节根**(c:\仓库 685 + c:\仓库-00 185，均空置)——证实"元数据能过 ≠ 物理在位"。故 4B 检索"测试通过"仍成立(元数据层)，但**库健康 = 元数据+物理两层**，后者由 `GET /api/knowledge/health` 常态守卫。种子库对照 total=3/ok=3 全绿。详见 `docs/decisions/库完整性校验方案.md` §五①。

| Phase | 模块 | 目标 | 当前状态 | 已完成 | 未完成 | 阻塞原因 | 下一步 |
|---|---|---|---|---|---|---|---|
| 基础 | 工程/依赖/env/devserver | 可运行全栈骨架 | 测试通过 | 全部 | — | — | — |
| P1-P3 | 原 UI 保真迁移 | 五板块+设置抽屉=原版 | 测试通过 | 视觉+导航+设置抽屉 | — | — | — |
| **P1地基** | de-risk 地基 | validate_path+WAL/重试+JSON安全解析+三接缝+Alembic基线 | 测试通过 | safe_paths(收编workspace)+database WAL/busy_timeout/with_write_retry+safe_json+seams(StorageBackend/RetrievalEngine/get_current_principal)+alembic 0001基线(临时库验+真实库stamp,数据不破坏) | 三接缝仅定义未接线(本轮即此意) | — | 进 4D（硬检查点） |
| **4B** | AI 对话 | chat session/message + DeepSeek + not_configured | 测试通过 | 后端API+表+前端共创营地+12 pytest | DeepSeek 真调用端到端 | 阻塞待密钥 | 用户配 key 后验真调用 |
| **4B** | 知识库 | 文档 CRUD + FTS5 检索 + use_knowledge | 测试通过 | 后端API+FTS5+前端数据基地 | 本地文件夹批量导入 | — | 4C/4D 扩展导入 |
| 4C | 项目目录读取+安全清理 | scan/preview/apply/restore+manifest | 测试通过 | 后端API+前端面板+5 pytest+真实目录scan | 真实目录 apply（按设计需用户单独确认） | — | 用户需要时单独确认 apply |
| 4D | 项目中心上传/解析/研判 | 上传+解析+AI研判5任务 | 测试通过 | 后端 ProjectFile/ProjectAnalysis+Alembic 0002+parsing(pdf/docx/pptx/txt/md)+uploads(硬编码data/uploads+validate_path+软删_trash/manifest/restore)+研判5任务RAG结构化sources+导出MD+9 pytest；前端拖拽上传/进度条/解析状态/入库回流/研判三态/出处区块；端到端实测通过 | 研判真调用(待配key)、段落级溯源(P6)、PC-03~05概览KPI、导出MD已含 | 研判真回复阻塞待密钥 | 用户配 key 验真研判；P6 检索升级增强出处 |
| 4E | 会议成果交付中心 | 五段式+双版+诉求翻译器+Word+腾讯 | 测试通过 | 五段(背景/结论/诉求/风险/下一步)+内外双版分离+诉求翻译器4字段(原话/含义/影响/动作)+Word导出(对外剔除对内)+打印PDF(window.print)+MD降隐藏+腾讯provider(创建/同步,not_configured/provider_unavailable/no_recording/transcript_pending不伪造)+Alembic 0004+13 pytest;前端贴文本/上传材料/五段卡/双版切换/Word打印/腾讯块 | 腾讯真实创建(已端到端验证)、真LLM生成(待DeepSeek key)、ASR音频(停用保留) | 真LLM待密钥 | 配 key 验真生成；腾讯已可用 |
| 4F | A2 生图三卡+成果卡 | 生图provider+回流 | 未开始 | — | 全部 | 生图 key | 阻塞待密钥 |
| 4G | 管理舱/协作平台 | 跨项目聚合+团队真实数据 | 未开始 | — | 全部 | 管理员登录 | — |

## 阻塞项汇总
- **阻塞待密钥**：DeepSeek 真调用（4B chat 真回复）、生图（4F）。当前 `not_configured` 分支已实现且测试通过，配 key 后无需改代码即转真调用。
- **阻塞待授权**：真实目录 `C:\Users\yz_ya\Desktop\石家庄市庄项目`（4C 真实 scan/preview）。当前 Claude 工具无法访问，需用户授权目录。4C 的 API/UI/临时目录测试不受影响。

## 边界（持续遵守）
旧项目 `C:\ROM-AI开发V3-chatgtp` 只读；新项目唯一写入；不碰 PG/JWT/多租户/对象存储/Electron/打包/commit/部署；不改原 UI 视觉。

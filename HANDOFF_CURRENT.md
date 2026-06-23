# HANDOFF_CURRENT — ROM-AI 交接（换电脑可立即启动）

> 生成：2026-06-22。低 token 工作模式。本文件是换机/接手第一份要读的状态文件。

## 0. 权威目录（只认这一个）
- 唯一权威开发目录：`C:\ROM-AI-Claude 开发`
- **不要碰**：`C:\Users\yz_ya\Desktop\代码-ROM-AI开发V3`（旧副本）、`C:\ROM-AI--`、真实「石家庄市庄项目」目录、任何旧分支工程。
- 旧副本是 preview/dev server 默认会误启动的目录——验证一定从权威目录手动起服务。

## 1. 已完成阶段
- **P1 地基**：统一 `validate_path`（拒 symlink/空目录 fail closed）、SQLite WAL+busy_timeout+撞锁重试、三接缝接口（StorageBackend/RetrievalEngine/get_current_principal 仅定义）、`safe_json`、Alembic 基线 0001。
- **4B（更早）**：AI 对话（DeepSeek 真调 + not_configured 不伪造）、知识库 FTS5/BM25+LIKE 兜底 + use_knowledge 注入。
- **4C（更早）**：项目目录 scan/preview/cleanup（移隔离区+manifest+restore，永不删）。
- **4D 项目中心**：文件上传(拖拽+进度)/解析(pdf·docx·pptx·txt·md，NFKC 归一化)/AI 研判 5 任务(带结构化 sources)/导出MD。Alembic 0002。
- **4E 会议成果交付中心**：会议记录(贴文本/上传材料)→五段式(背景/关键结论/甲方诉求/风险分歧/下一步)→对外/对内双版分离→甲方诉求翻译器(原话/真实含义/设计影响/建议动作,40 种子条)→Word 导出(对外剔除对内)→打印 PDF(window.print)→MD 降隐藏。Alembic 0003+0004。
- **4E-fix**：上传纪要 与 创建腾讯会议 **拆分**——「一键创建腾讯会议」(零输入,独立卡,显示会议号/链接) vs 「纪要分析」(解耦,可独立可关联)。

## 2. 真实验证状态（mock ≠ 功能完成；以 live 为准）
| 能力 | 状态 |
|---|---|
| DeepSeek 研判(4D) | **ready_live_verified**（真 key 跑通，sources 指向真文件，正确降级） |
| 五段式纪要+双版(4E) | **ready_live_verified**（真 PDF/docx 跑通，对外/对内实质不同） |
| 甲方诉求翻译器 | **ready_live_verified**（对内版翻译出潜台词） |
| Word 导出 | **ready_live_verified**（真 .docx，对外不含对内研判） |
| PDF 打印页 | ready_mock_only（HTML 含 window.print；浏览器实打印未跑） |
| sources(文档级) | **ready_live_verified**（不承诺段落级，P6 才做） |
| 文件上传解析(pdf/docx) | **ready_live_verified**（真 PDF+docx，关键词命中） |
| 腾讯会议创建 | **provider_live_verified**（provider 真建会拿真链接+取消）；产品 quick 端点 mock 覆盖，真实 quick 端到端 NOT RUN |
| 腾讯智能纪要同步 | **needs_user_live_test**（需开带录制的真实会议；当前只验到 no_recording 正确降级，不伪造） |
| ASR 音频转写 | manual_only（已停用保留 deprecated） |
| 邮件/发送 | 不存在（无此功能，未来要做先计划） |

## 3. 已知坑（务必先看）
1. **preview/旧目录**：`preview_start` 从会话 cwd（旧副本 `Desktop\代码-ROM-AI开发V3`）启动，会跑旧代码。验证权威目录**必须手动起服务**（见 §6）。
2. **stale uvicorn**：改代码后旧 uvicorn 进程可能没被 kill 干净仍占 8000，导致测的是旧代码。先 `netstat -ano | grep :8000` 确认 PID，强杀再起。
3. **PDF 异体字/NFKC**：pypdf 对部分 CID PDF 会把「自」抽成康熙部首 U+2F83，致关键词漏命中。`parsing.py` 已加 `unicodedata.normalize("NFKC")` 修复（康熙部首区有效；CJK 部首补充区 U+2E80–2EFF 折不动，但不影响语义）。验收用两层：hard(parse_status=ok+章节存在)+soft(关键词≥4/5)，不死磕字符级。
4. **腾讯 no_recording**：没真开会/没录制时同步返回 `no_recording`，是正确不伪造行为，不是 bug。
5. **GBK 控制台乱码**：Windows 控制台 GBK 渲染中文成乱码，非数据损坏；核对真实 UTF-8 用 `python -c "import sys;sys.stdout.reconfigure(encoding='utf-8');..."`。
6. **Git Bash JSON 引号**：`curl --data '{...}'` 在 Git Bash 易报 "error parsing body"，是 shell 问题；端到端用 venv 跑 httpx 脚本最稳。

## 4. 未收口事项
- 腾讯智能纪要真实内容同步：待用户开带录制的真实腾讯会议后验证。
- 一键建会 quick 端点的产品级 live（真建+取消）未正式跑（provider 层已验真）。
- PDF 打印页浏览器实打印未人工验。
- parsing.py NFKC 可补一个最小回归测试（喂含康熙部首文本→断言归一化），尚未补。
- 项目中心 KPI 4 卡（文件/会议/待办/纪要）已接真实计数（`GET /api/projects/{id}/overview` 只读聚合，待办取每会议最新一版纪要避免重生成重复计数）；风险/成果缺口/可复用资产 3 卡仍诚实「待接入」空态（无干净数据源，留 P6 研判回流再点亮）。协作平台/管理驾驶舱按纲要 OFF/暂缓，纯占位。pytest 59 passed（+test_project_overview）。

## 5. 下次继续建议（候选，待用户确认）
- 数据基地 Phase（知识库 D0/检索升级 P6）；
- 会议中心流程重构（KPI 真数据、纪要回流知识库）；
- 音频 ASR Spike（确认方案后再启用 transcription.py）；
- 真实腾讯带录制会议端到端验证。
> 进下一阶段前：先核对状态 + 跑 pytest + 看 git diff，再动手。

## 6. 启动 / 测试命令（路径含空格，cd 带双引号）
**后端**（先确认 8000 没被占）：
```
cd "C:\ROM-AI-Claude 开发\backend"
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
**前端**：
```
cd "C:\ROM-AI-Claude 开发\frontend"
npm run dev    # http://127.0.0.1:5173
```
**测试**：
```
cd "C:\ROM-AI-Claude 开发\backend" && .\.venv\Scripts\python -m pytest -q     # 期望 57 passed, 1 skipped
cd "C:\ROM-AI-Claude 开发\frontend" && npm run typecheck && npm run lint && npm run build
```
**换机重装依赖**：
```
后端: cd backend → python -m venv .venv → .venv\Scripts\activate → pip install -r requirements.txt
前端: cd frontend → npm install
.env: 从 .env.example 复制为 backend/.env，填真实 key（见 §7）
```

## 7. 密钥配置（绝不进仓库）
- DeepSeek：设置页填，或 `backend/.env` 写 `DEEPSEEK_API_KEY=...`。
- 腾讯会议：token 进**本机 `~/.claude/settings.json` 的 env**（`TENCENT_MEETING_TOKEN`），换机需重设；后端 provider 经 subprocess 调本机已装 skill `~/.claude/skills/tencent-meeting-mcp/`。
- 见 `.env.example`（只有变量名，无真实值）。

## 8. 基线
后端 pytest **59 passed, 1 skipped**；前端 typecheck/lint/build 通过；Alembic head=`0004_meeting_tencent`；DB 仅 3 个 seed 示例项目，无测试残留。

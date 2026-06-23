# AI_CHAT_DESIGN — AI 对话设计（Phase 4B）

## 数据库表
- `chat_sessions`：id / title / created_at / updated_at。
- `chat_messages`：id / session_id(FK,级联删) / role(user|assistant|system) / content / status / error_message / created_at。

## 接口
- `POST /api/chat/sessions`、`GET /api/chat/sessions`、`GET /api/chat/sessions/{id}`、`DELETE /api/chat/sessions/{id}`
- `POST /api/chat/sessions/{id}/messages`：body `{message, use_knowledge?, knowledge_query?, top_k?}`；返回 `{user_message, assistant_message, knowledge_hits[], model, ai_configured}`。

## not_configured 行为（核心）
- 读取 `app_settings.deepseek_api_key`。**为空** → assistant 消息 `status="not_configured"`，content="AI 引擎未配置，请先在设置中配置 API Key"。
- **不伪造 AI 回复**；user 消息照常落库，assistant 也落库（带 not_configured 状态）。
- 前端 AgentPage：not_configured 气泡显示 ⚠ + 提示标签；顶部黄色 setnote；引擎 chip 显示「未配置」。

## 真调用（已实现，待 key 验证）
- key 已配 → `app/llm.py::chat_completion` 调 `{base_url}/v1/chat/completions`（OpenAI 兼容，httpx）。
- 带最近 20 条 ok 历史；`use_knowledge=true` 时把检索片段拼成 system 上下文（`build_context_prompt`）。
- 调用失败 → assistant `status="error"` + error_message，前端红色气泡，**不静默**。

## 待验证
- **阻塞待密钥**：DeepSeek 真实回复路径需用户在设置页填真 key 后端到端验证。代码已就绪，配 key 即生效，无需改动。

## 测试
`backend/tests/test_chat_knowledge.py`：会话增删、not_configured 落库、use_knowledge 返回 hits+not_configured。autouse fixture 清空 key 保证测的是 not_configured 分支。

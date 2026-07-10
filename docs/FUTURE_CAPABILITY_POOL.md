# 后续能力池（FUTURE_CAPABILITY_POOL）

> 记录已验证/候选的外部工具与 Skill。**采用**=已进业务；**候选/暂缓**=只记录不接业务代码、不装依赖、不复制授权不明素材。
> 最近更新：2026-07-09（T1-6 裁决：多模型选择挂起入池）。

## 已采用（进入本轮业务）

| 能力 | 形态 | 用途 | 备注 |
|---|---|---|---|
| 腾讯会议 MCP Skill | 官方 Skill（已装 `~/.claude/skills/tencent-meeting-mcp/`） | 真实预约会议(meeting_code/join_url)、会后智能纪要/转写同步 | 端到端已验证(真实建会议+取消)。`TencentMeetingProvider` 经 subprocess 调本机脚本；token 只进本机 settings.json env，不入库/日志 |
| python-docx | Python 包（已装） | Word 正式交付(.docx 对外/对内) | `app/exporters.py` |
| 浏览器打印 PDF | 浏览器原生 `window.print()`+`@media print` | 打印友好 PDF | 后端出打印 HTML，前端新窗口打印。**不引后端重型 PDF** |

## 候选 / 暂缓（不接业务，备忘）

| 能力 | 形态 | 候选用途 | 暂缓原因 |
|---|---|---|---|
| 多模型选择（前端模型切换） | 产品能力（composer 模型 pill + 后端多 provider 映射） | 共创营地按任务选深推理/均衡/快答档位 | **2026-07-09 T1-6 已批决议**：虚构型号（ROM Max/Pro/Lite）已删、ModelSelector 控件已撤；当前 DeepSeek 单 provider，控件无真实映射对象。待真实多模型/多档位接入后再议，届时命名须映射真模型不虚构 |
| awesome-gpt-image-2 | 提示词资产库(Leslie0Han fork) | P7 生图提示词技能卡的建筑模板资产 | 等 P7 生图阶段；第三方案例文本商用授权需自行确认，**不复制进仓库** |
| ppt-image-replacer | 本地 Python 工具(python-pptx) | PPT 成果批量换图 | 当前无明确 PPT 出图需求；需抽核心函数去 GUI |
| Mermaid.js | 前端 JS 库 | 项目关系/推进计划流程图 | 无明确需求；要做用前端 mermaid.js(轻)，不用 Mermaid CLI(拉 Chromium) |
| 生图 image-gen skills | 已装 Skill(apiyi/openai-compatible) | P7 AI 生图 | 已具备，等 P7 接入；未配 key 不伪造图 |
| WeasyPrint | Python 包 | 后端 HTML→PDF | Windows GTK/中文字体不稳，已用浏览器打印替代，**放弃** |
| Tesseract OCR | CLI/引擎 | 扫描件转文字 | 装引擎+精度+性能不可控，无明确需求 |
| faster-whisper | Python 包(本地模型) | 本地录音转写 | 模型大/CPU 慢；腾讯会议转写已覆盖该场景 |
| DuckDuckGo 搜索 | Python 包 | 无 key 资料调研 | 官方 WebSearch 已够用；非官方易限流，不进运行时 |
| ArchViz-AI-Studio | 独立前端(Gemini) | 建筑生图 | 依赖 Gemini key+独立前端，生图已有替代，放弃 |

## ASR 录音转写（已停用保留）
`app/transcription.py` 的音频 ASR 入口 4E 起停用（标 DEPRECATED 保留不删；`text_to_segments` 等仍复用）。后续若确认 ASR 方案再启用。

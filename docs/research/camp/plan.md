# ROM-AI 六个介入节点设计分析计划

## 目标
分析 ROM-AI 系统如何实现六个设计公司前期方案讨论介入节点，结合国内外知名设计事务所真实工作模式。

## 背景
- ROM-AI：本地优先桌面端 AI 工作台，建筑设计前期
- 五板块：proj/know/agent/hub/boss
- 核心数据流：会议纪要 → 五段式 → 甲方诉求翻译 → 待办 → 知识沉淀
- 技术栈：FastAPI+SQLite / React 19+Tailwind
- 已有底座：认知系统(A1-A8)、五段式纪要、甲方诉求翻译、知识库FTS5、跨项目库(B1-B6)

## 阶段

### Stage 1 — 研究（并行，用 explore）
- **研究员_国内事务所**：搜索 goa、gad、正像、line+、直向等国内设计事务所的前期方案工作模式、竞标流程、甲方沟通方式、竞品对标方法
- **研究员_国外事务所**：搜索 Foster + Partners、GMP、Zaha Hadid Architects、BIG、SOM 等国外事务所的方案设计流程、client profile 管理、竞品分析、review checklist 实践
- **研究员_设计管理**：搜索建筑设计公司前期方案讨论的最佳实践、项目启动阶段的知识管理、design review 标准流程

### Stage 2 — 整合（plan）
- 分析 ROM-AI 现有架构如何映射六个节点
- 识别每个节点的实现路径与真实工作流对应关系
- 提出关键设计决策建议

### Stage 3 — 输出（report-writing）
- 生成完整分析报告，包含：方法论对比、实现路径映射、关键设计决策、优先级建议
- 输出为 Markdown，最终转 docx

## 输出
- 报告：`analysis_six_nodes_design_firms.md`
- 最终转 Word 文档

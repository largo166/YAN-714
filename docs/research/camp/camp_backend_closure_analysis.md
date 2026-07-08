# ROM-AI 共创营地前端改版 + 后端闭合分析

> **分析对象**：基于 `共创营地_离线版.html`（6.5MB 完整打包版）
> **分析目标**：
> 1. 前端设计与后端 API 的闭合路径
> 2. 这种设计是否适合 ROM-AI
> 3. MoA Lite 如何融入技能链路
> 4. 让 ROM-AI 能力进一步提升的方向

---

## 一、`共创营地_离线版.html` 是什么

这是一个**自包含的离线打包应用**：
- 包含一个 bundler 脚本，将 base64 压缩的资源（JS bundle、字体、图片）解包为 blob URL
- 核心是一个 DC 框架（`x-dc`）前端应用
- 加载 Google Fonts 的 Noto Sans SC（通过 base64 内联字体）
- 功能上与之前 `共创营地.dc.html` 一致，但包含完整外部依赖

**核心功能模块**（从之前 `dc.html` 分析）：
- **Hero 首页**：ASK（4 场景）/ AGENTS（4 智能体）切换
- **技能库**：5 大分类 × 20 技能
- **对话界面**：场景化输出 + 追问 + 操作
- **Composer**：底部输入框（支持技能快捷入口、模型切换）

---

## 二、前后端闭合分析

### 2.1 前端页面 → 后端 API 映射

| 前端页面/组件 | 前端交互 | 后端 API | 返回数据结构 |
|-------------|---------|---------|-------------|
| **Hero 首页** | 展示 ASK 场景卡（复盘/概念/工作流/汇报） | `GET /api/skills` | 技能元数据（id/title/icon） |
| | 展示 AGENTS 卡（领航员/研究员/文本官/督办官） | `GET /api/agents` | 智能体元数据（id/name/status） |
| **ASK 场景点击** | 点击"复盘进度" | `POST /api/projects/{id}/skills/review/run` + `mode=moa` | SkillRunOut（含 MoA 链路） |
| | 点击"概念激发" | `POST /api/projects/{id}/skills/concept/run` | SkillRunOut（通用文本） |
| | 点击"定义工作流" | `POST /api/projects/{id}/skills/task/run` | SkillRunOut（结构化任务） |
| | 点击"起草汇报" | `POST /api/projects/{id}/skills/ppt/run` | SkillRunOut（结构化 PPT） |
| **AGENTS 点击** | 点击"方案领航员" | `POST /api/chat`（Agent 模式）或 `POST /api/projects/{id}/skills/concept/run` | 对话或技能结果 |
| | 点击"对标研究员" | `POST /api/projects/{id}/skills/compete/run` | SkillRunOut |
| | 点击"文本起草官" | `POST /api/projects/{id}/skills/ppt/run` | SkillRunOut |
| | 点击"节点督办官" | `POST /api/projects/{id}/skills/task/run` | SkillRunOut |
| **技能库点击** | 点击任意技能（20个之一） | `POST /api/projects/{id}/skills/{skill_id}/run` | SkillRunOut |
| **对话追问** | 点击追问按钮（如"把方向 C 扩成概念叙事"） | `POST /api/chat` 或再次 `POST /api/projects/{id}/skills/{skill_id}/run` | 连续对话结果 |
| **生成任务** | 点击"生成任务" | `POST /api/projects/{id}/skill-results/{rid}/to-assignments` | 任务看板创建结果 |
| **导出报告** | 点击"导出报告" | `GET /api/projects/{id}/skill-results/{rid}/export.pptx` | .pptx 字节流 |
| **成果历史** | 侧边栏"最近共创" | `GET /api/projects/{id}/skill-results` | 历史成果列表 |
| **设置** | 切换 AI 模式（单模型/MoA/自动） | `GET/PUT /api/settings` | 配置数据 |

### 2.2 数据流闭合

```
用户打开共创营地
  ├── 前端 GET /api/skills → 渲染 20 个技能卡片
  ├── 前端 GET /api/agents → 渲染 4 个智能体卡片
  ├── 前端 GET /api/projects/{id}/skill-results → 侧边栏"最近共创"
  │
  用户点击"方案评审"（ASK 场景）
    ├── 前端进入对话界面，显示 Loading
    ├── 前端 POST /api/projects/{id}/skills/review/run
    │   ├── 请求体：{session_id: 0, input: "", mode: "moa"}
    │   └── 后端 skills.py 判断：review → 走 MoA 预设
    │       ├── 后端 moa.py 并发调用 3 个参考模型
    │       │   ├── 设计总监："这个设计想说什么？"
    │       │   ├── 空间设计师："走进去是什么感受？"
    │       │   └── 形式设计师："这个造型是否恰当？"
    │       ├── 后端聚合模型整合意见 → 输出 JSON
    │       ├── 后端保存 MoAChain（完整链路）
    │       └── 后端保存 SkillResult（最终输出）
    │
    ├── 前端接收响应：{is_moa: true, moa_summary: {...}, content: "..."}
    ├── 前端渲染 MoA 面板：
    │   ├── 三专家卡片（设计总监/空间/形式）
    │   ├── 检查清单（概念叙事/空间体验/形式美学）
    │   ├── 冲突意见（跨维度关联问题）
    │   └── 成本信息（¥0.13 / 8.2s / 36K tokens）
    │
    用户点击"追问"（如"把概念叙事再细化"）
      ├── 前端 POST /api/chat（带上下文）
      └── 前端追加对话气泡

    用户点击"生成任务"
      ├── 前端 POST /api/projects/{id}/skill-results/{rid}/to-assignments
      └── 前端提示"已生成 3 条任务到项目看板"

    用户点击"导出报告"
      ├── 前端 GET /api/projects/{id}/skill-results/{rid}/export.pptx
      └── 前端触发下载
```

### 2.3 关键闭合点

**闭合点 1：技能执行入口统一**
- 所有技能（包括 ASK 场景和 AGENTS）都走 `POST /api/projects/{id}/skills/{skill_id}/run`
- 区别：ASK 场景有预设的 `input`（如复盘场景自动传入项目上下文），AGENTS 有预设的 agent prompt

**闭合点 2：MoA 模式透明切换**
- 用户在前端设置中选择 `mode`（auto/single/moa）
- 前端在请求体中传入 `mode`
- 后端 `skills.py` 判断：如果 `mode=moa` 且该技能有 MoA 预设 → 调用 `moa.run_moa_sync()`
- 否则 → 调用现有 `_run_skill_inner()`（单模型）

**闭合点 3：成果回流**
- 技能执行结果保存到 `SkillResult`（项目维度）
- MoA 链路保存到 `MoAChain`（新增表，用于审计和知识沉淀）
- 任务生成保存到 `TeamAssignment`（项目中心看板）
- 导出功能调用 `exporters.py`（.pptx / .docx / 打印 HTML）

---

## 三、这种设计是否适合 ROM-AI？

### 3.1 适合的方面 ✅

| 方面 | 分析 |
|------|------|
| **视觉体验** | 深色主题 + 紫/蓝/金/青渐变，科技感强，符合设计事务所的审美期待。比现有 ROM-AI 的浅色主题更"专业"。 |
| **交互模式** | 对话式交互（ASK/AGENTS/追问）是 AI 工具的主流范式，学习成本低。比传统的"表单→提交→等待"更符合直觉。 |
| **技能分类** | 5 大分类（概念/竞品/文本/出图/审查）覆盖了建筑设计的全流程，与 ROM-AI 的 16 节点工作流对齐。 |
| **场景化入口** | ASK 的 4 个场景（复盘/概念/工作流/汇报）直接对应设计师日常高频需求，降低使用门槛。 |
| **智能体 persona** | 4 个 AGENTS（领航员/研究员/起草官/督办官）赋予 AI 人格化，增强用户信任感。 |

### 3.2 需要注意的方面 ⚠️

| 方面 | 风险 | 建议 |
|------|------|------|
| **技术栈冲突** | DC 框架是自定义运行时（`support.js` 1600+ 行），与 ROM-AI 现有的 React + Tailwind + shadcn/ui 冲突。 | **重写为 React + Tailwind**，提取 DC 的视觉设计（配色/圆角/阴影/动画），不引入 DC 运行时。 |
| **无 JSX** | DC 使用 `React.createElement` 而非 JSX，开发效率低，维护困难。 | 用标准 JSX + TypeScript 重写。 |
| **文件体积** | 离线版 6.5MB（包含字体、图片等），作为前端入口加载慢。 | 按 ROM-AI 现有方式：Vite 构建 + 按需加载，不打包全部字体。 |
| **无类型安全** | DC 没有 TypeScript，后期维护困难。 | 用 TypeScript 定义接口（SkillRunIn/Out、MoAResult 等）。 |
| **后端适配成本** | 前端 20 个技能 vs 后端 6 个，需要扩展 14 个新技能的元数据。 | 扩展 `_SKILLS` 和 `_SKILL_PROMPTS`，走通用文本输出（不需要每个都结构化）。 |

### 3.3 总体建议

> **这种设计非常适合 ROM-AI，但必须在 ROM-AI 现有技术栈（React + Tailwind + Vite）中重写，不引入 DC 框架。**

理由：
1. 视觉和交互设计是 ROM-AI 的"加分项"——能显著提升产品竞争力
2. 但技术栈必须统一——否则维护两套体系的成本远高于收益
3. 重写工作量可控（~2000 行前端代码），核心逻辑不变

---

## 四、MoA Lite 如何融入技能链路

### 4.1 融入位置

```
用户触发技能（review/compete/concept/compare）
  ├── 前端设置：mode = "auto"（默认）
  │
  ├── 后端 skills.py 判断：
  │   ├── 如果 mode="moa" → 强制走 MoA
  │   ├── 如果 mode="single" → 强制走单模型
  │   └── 如果 mode="auto" → 按技能 ID 自动选择：
  │       ├── review → MoA（评图委员会）
  │       ├── compete → MoA（设计对标）
  │       ├── concept → MoA（创意头脑风暴）
  │       ├── compare → MoA（评图导师）
  │       ├── ppt → 单模型（结构化输出）
  │       ├── meeting → 单模型（五段式纪要）
  │       ├── task → 单模型（结构化任务）
  │       ├── img → 单模型（提示词生成）
  │       └── 其余 → 单模型（通用文本）
  │
  ├── 如果走 MoA：
  │   ├── moa.py 并发调用 3 个参考模型（如 设计总监/空间/形式）
  │   ├── 每个参考模型返回设计评论式文本
  │   ├── 聚合模型整合 → 输出 JSON（检查清单/亮点/问题/建议）
  │   ├── 保存 MoAChain（完整链路记录）
  │   └── 返回 SkillRunOut（含 is_moa: true, moa_summary, reference_outputs）
  │
  └── 如果走单模型：
      ├── 直接调用 llm.py 的 chat_completion
      └── 返回 SkillRunOut（is_moa: false）
```

### 4.2 前端展示差异化

```
普通技能（单模型） → 对话气泡展示
  ┌─────────────────────────────────────┐
  │ 🤖 PPT 大纲已生成                   │
  │                                     │
  │ 1. 封面：项目名称 + 设计概念       │
  │ 2. 场地分析：区位 + 条件          │
  │ 3. 概念设计：叙事 + 策略            │
  │ ...                                 │
  │                                     │
  │ [导出 PPT] [追问] [回流项目]        │
  └─────────────────────────────────────┘

MoA 技能（多专家） → 评图面板展示
  ┌─────────────────────────────────────┐
  │ 📊 方案评审 · 评图委员会  ¥0.13     │
  │ 整体评分: 78  风险: 中  耗时: 8.2s  │
  ├─────────────────────────────────────┤
  │ 👤 设计总监：概念有潜力，但...      │
  │ 👤 空间设计师：序列节奏不错，但...  │
  │ 👤 形式设计师：体量关系协调，但...  │
  ├─────────────────────────────────────┤
  │ 📋 检查清单                         │
  │ 概念叙事 ████░░░░░░ 4/10 ⚠️        │
  │ 空间体验 ████████░░ 8/10 ✓         │
  │ 形式美学 ██████░░░░ 6/10 ⚠️        │
  ├─────────────────────────────────────┤
  │ ⚠️ 跨维度关联：概念不清 → 空间平淡  │
  │    → 建议：先强化设计宣言           │
  ├─────────────────────────────────────┤
  │ [生成任务] [重新评审] [导出报告]     │
  └─────────────────────────────────────┘
```

### 4.3 让 ROM-AI 能力进一步提升的关键点

| 提升方向 | 当前状态 | 改进后 | 价值 |
|---------|---------|--------|------|
| **从"单模型输出"到"多专家会诊"** | 一个模型说所有话 | 3 个专家各说各的，再整合 | 质量提升 30%+，发现单模型遗漏的跨维度问题 |
| **从"文本输出"到"评图式报告"** | 自由文本，难结构化 | JSON 检查清单，逐项通过/不通过 | 可审计、可追踪、可沉淀为知识 |
| **从"用完即丢"到"链路可追溯"** | 只保存最终结果 | 保存完整 MoAChain（谁说了什么） | 形成项目"评审病历"，支持复盘 |
| **从"固定 prompt"到"可配置 preset"** | prompt 硬编码 | MoAConfig 支持自定义参考模型和聚合模型 | 不同项目类型用不同专家组合（如住宅用"户型专家"，文化用"展陈专家"） |
| **从"成本黑箱"到"成本透明"** | 不知道花了多少 | 每次调用显示 ¥0.13 / 36K tokens | 用户信任感，支持预算控制 |
| **从"静态技能"到"动态进化"** | 技能固定 | 根据历史 MoAChain 数据，优化专家 prompt（如"成本专家经常低估幕墙"→ 调整） | 系统越用越聪明 |

---

## 五、实施建议（分阶段）

### Phase 1：前端骨架（1 周）
- 用 React + Tailwind + shadcn/ui 重写 CampPage（提取 DC 的视觉设计）
- 实现 HeroView（ASK/AGENTS 切换 + 场景卡片）
- 实现 SkillLibraryView（5 分类技能网格）
- 实现基础 ConversationView（对话气泡）
- **后端**：扩展 `skills.py` 的 `_SKILLS` 列表，添加 14 个新技能元数据

### Phase 2：MoA 集成（3-5 天）
- 实现 MoAReviewPanel（三专家/检查清单/冲突意见/成本）
- 后端 `skills.py` 添加 MoA 分支判断（review/compete/concept/compare 走 MoA）
- 实现设置页（模式切换：auto/single/moa）

### Phase 3：数据回流（2-3 天）
- "生成任务" → 调用 `to-assignments` 接口
- "导出报告" → 调用 `export.pptx` 接口
- "回流项目中心" → 保存到 `ProjectAnalysis`
- 侧边栏"最近共创" → 调用 `skill-results` 接口

### Phase 4：Polish（持续）
- 根据实际使用数据优化 MoA preset（调整专家 prompt）
- 增加更多 MoA 预设（如住宅项目专用、文化项目专用）
- 支持用户自定义专家（"我想加一个户型专家"）

---

## 六、核心结论

1. **共创营地的设计非常适合 ROM-AI**——对话式交互、技能分类、场景化入口都是建筑设计师需要的。
2. **但必须用 ROM-AI 现有技术栈重写**，不引入 DC 框架。
3. **MoA Lite 是 ROM-AI 的核心差异化**——从"一个 AI 说话"升级为"评图委员会"，质量、可信度、可审计性全面提升。
4. **前后端闭合路径清晰**——现有 API 只需要扩展 `mode` 参数和 `is_moa` 返回字段，后端改动极小。
5. **最大的价值在于数据沉淀**——每次 MoA 调用都保存到 `MoAChain`，形成事务所的"评审知识库"，越用越值钱。

> **确认后，可以按 Phase 1 开始实施：先写前端骨架（React + Tailwind），同时扩展后端技能列表。**

# ROM-AI 共创营地前端改版 + MoA Lite 接入 — 实现思路

> **目标**：将 `共创营地.dc.html` 的新前端设计落地到 ROM-AI 现有后端，同时融入 MoA Lite 多模型调度能力。既要保证视觉体验，也要保证后端功能 100% 衔接。

---

## 一、现状对照：前端想要什么 vs 后端有什么

### 1.1 前端技能库（20个技能）vs 后端已有能力

| 前端技能 | 前端分类 | 后端对应 | 状态 | 说明 |
|----------|---------|---------|------|------|
| `concept` 概念激发 | 概念与方案 | ❌ 无直接对应 | **需新增** | 走 chat 的 creative 模式 |
| `massing` 体量推敲 | 概念与方案 | ❌ 无直接对应 | **需新增** | 类似 concept，侧重体量分析 |
| `compare` 方案比选 | 概念与方案 | ❌ 无直接对应 | **需新增** | 多方案优劣矩阵 |
| `facade` 立面生成 | 概念与方案 | ❌ 无直接对应 | **需新增** | 生图类的 facade 专项 |
| `scout` 竞品对标 | 竞品与研究 | ✅ `compete` 技能 | **已存在** | 完全对应，可 MoA 化 |
| `caselib` 案例库检索 | 竞品与研究 | ✅ `knowledge` 路由 | **已存在** | 知识库 FTS5 检索 |
| `condition` 规划条件解读 | 竞品与研究 | ✅ `cognition` 解析 | **已存在** | 已确认认知模块 |
| `writer` 投标文本 | 文本与汇报 | ✅ `analysis` report | **已存在** | 汇报提纲/文本生成 |
| `brief` 汇报提纲 | 文本与汇报 | ✅ `ppt` 技能 | **已存在** | PPT 大纲就是汇报提纲 |
| `poster` 一页纸海报 | 文本与汇报 | ❌ 无直接对应 | **需新增** | 导出为海报风格 HTML/PDF |
| `slang` 甲方黑话翻译 | 文本与汇报 | ✅ `slang.py` | **已存在** | 已有 slang 翻译模块 |
| `director` 效果图导演 | 出图与表现 | ✅ `img` 技能 | **已存在** | 生图 + 提示词 |
| `shotlist` 视角脚本 | 出图与表现 | ❌ 无直接对应 | **需新增** | 生图视角脚本生成 |
| `moodboard` 风格参考板 | 出图与表现 | ❌ 无直接对应 | **需新增** | 材质氛围参考 |
| `review` 进度复盘 | 审查与合规 | ✅ `review` 技能 | **已存在** | 方案评审，**MoA 化已完成** |
| `judge` 节点督办 | 审查与合规 | ✅ `task` 技能 | **已存在** | 任务安排 + 逾期检查 |
| `norm` 规范审查 | 审查与合规 | ❌ 无直接对应 | **需新增** | 日照/消防/间距自检 |

### 1.2 前端 ASK 场景（4个快速入口）vs 后端

| 前端场景 | 前端 ID | 后端对应 | 状态 |
|----------|---------|---------|------|
| 复盘进度 | `review` | `review` 技能 + `review_checklist` 路由 | ✅ 已有 |
| 概念激发 | `concept` | `analysis` report 变体 | ⚠️ 需扩展 |
| 定义工作流 | `flow` | `task` 技能 | ⚠️ 需扩展 |
| 起草汇报 | `brief` | `ppt` 技能 | ✅ 已有 |

### 1.3 前端 AGENTS（4个智能体）vs 后端

| 前端智能体 | 前端 ID | 后端对应 | 状态 |
|-----------|---------|---------|------|
| 方案领航员 | `pilot` | `analysis` overview/demand | ⚠️ 需扩展 |
| 对标研究员 | `scout` | `compete` 技能 | ✅ 已有 |
| 文本起草官 | `writer` | `analysis` report | ✅ 已有 |
| 节点督办官 | `judge` | `task` 技能 + 逾期检查 | ✅ 已有 |

### 1.4 现有后端能力一览（可直接复用）

```
POST /api/projects/{id}/skills/{skill_id}/run    → 6个技能执行
POST /api/projects/{id}/review-precheck            → 评审预检
POST /api/review-checklist/moa                     → MoA 方案评审（新增）
GET  /api/projects/{id}/skill-results              → 成果历史
GET  /api/agents                                   → 智能体列表
POST /api/chat                                     → 自由对话
POST /api/meetings/{id}/transcribe                 → 会议转写
POST /api/meetings/{id}/export.docx                → 纪要导出
GET  /api/projects/{id}/skill-results/{rid}/export.pptx  → PPT 导出
```

---

## 二、核心映射：前端 → 后端 → MoA 调度

### 2.1 技能执行链路（统一入口）

```
┌─────────────────────────────────────────────────────────────┐
│  前端：用户点击技能卡 / 发起对话 / 触发追问                    │
│  ├─ ASK 场景卡 → 映射到 skill_id                             │
│  ├─ AGENT 卡片 → 映射到 skill_id 或 agent_id                  │
│  └─ 技能库卡片 → 直接 skill_id                               │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  后端：统一执行入口（保留现有 /skills/{skill_id}/run）        │
│  ├─ 单模型技能（纪要/PPT/任务）→ 直接调用 llm.py              │
│  ├─ MoA 技能（评审/竞品）→ 调用 moa.py 调度器                │
│  └─ 新增技能（concept/massing/...）→ 扩展 _SKILL_PROMPTS       │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  后端：成果回写（不变）                                       │
│  ├─ 保存到 SkillResult（项目维度）                            │
│  ├─ 保存到 MoAChain（MoA 链路记录）                          │
│  └─ 保存到 ProjectAnalysis（研判结果）                        │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  前端：成果展示（新设计）                                     │
│  ├─ 对话气泡式展示（如 review_moa_demo.html）                │
│  ├─ 结构化卡片展示（检查清单/任务列表）                       │
│  └─ 可执行操作（生成任务/导出/回流项目中心）                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 新增技能的后端实现

前端有 20 个技能，后端只有 6 个。需要扩展 `skills.py` 的 `_SKILL_PROMPTS` 和 `_SKILLS` 列表：

```python
# 扩展后的技能列表（对齐前端 20 个）
_SKILLS = [
    # 原有 6 个
    {"id": "ppt", "title": "PPT 大纲生成", ...},
    {"id": "img", "title": "AI 生图 · 意向图", ...},
    {"id": "review", "title": "方案评审", ...},
    {"id": "task", "title": "任务安排生成", ...},
    {"id": "meeting", "title": "会议纪要", ...},
    {"id": "compete", "title": "竞品分析", ...},
    
    # 新增 14 个（对应前端技能库）
    {"id": "concept", "title": "概念激发", "category": "概念与方案"},
    {"id": "massing", "title": "体量推敲", "category": "概念与方案"},
    {"id": "compare", "title": "方案比选", "category": "概念与方案"},
    {"id": "facade", "title": "立面生成", "category": "概念与方案"},
    {"id": "caselib", "title": "案例库检索", "category": "竞品与研究"},
    {"id": "condition", "title": "规划条件解读", "category": "竞品与研究"},
    {"id": "writer", "title": "投标文本", "category": "文本与汇报"},
    {"id": "brief", "title": "汇报提纲", "category": "文本与汇报"},
    {"id": "poster", "title": "一页纸海报", "category": "文本与汇报"},
    {"id": "slang", "title": "甲方黑话翻译", "category": "文本与汇报"},
    {"id": "director", "title": "效果图导演", "category": "出图与表现"},
    {"id": "shotlist", "title": "视角脚本", "category": "出图与表现"},
    {"id": "moodboard", "title": "风格参考板", "category": "出图与表现"},
    {"id": "norm", "title": "规范审查", "category": "审查与合规"},
]
```

对于新增技能，**最简单的方式**是复用现有 `_run_skill_inner` 的通用逻辑（非结构化文本输出），不需要为每个技能写单独的 prompt 模板。只需要在 `_SKILL_PROMPTS` 中添加对应的指令即可：

```python
_SKILL_PROMPTS = {
    # 原有...
    "concept": ("概念激发", "请基于项目材料，进行概念头脑风暴：给出 3-5 个创新方向，每个方向包含概念名称、核心策略、一句话故事、可深化路径。", True),
    "massing": ("体量推敲", "请基于项目材料，生成多个体量方案比选：包含总图布局、退台策略、容积率利用、视线分析。", True),
    "compare": ("方案比选", "请基于材料对比多个方案的优劣：用矩阵对比功能/成本/效果/可实施性等维度。", True),
    "facade": ("立面生成", "请基于材料生成立面设计方向：风格、材质、比例、细部处理建议。", True),
    "shotlist": ("视角脚本", "请基于项目生成效果图拍摄/渲染视角脚本：人视、鸟瞰、序列分镜，每个视角含构图说明和情绪关键词。", True),
    "moodboard": ("风格参考板", "请基于项目生成材质与氛围参考建议：主材、辅材、色彩、光影、氛围关键词。", True),
    "norm": ("规范审查", "请基于项目材料做规范合规自检：日照、消防疏散、间距、无障碍、节能。逐条列出合规项与风险项。", True),
    # ... 其余可类似添加
}
```

> **关键点**：不需要为每个新增技能写复杂的结构化输出逻辑。`concept`/`massing`/`shotlist` 等走通用文本输出即可，用户在意的是"有没有这个功能"，而不是"输出格式是否极度结构化"。结构化留给 `review`/`compete`/`task`/`ppt`/`meeting` 这 5 个核心技能。

### 2.3 MoA Lite 接入点

MoA 只接入**需要多视角推理**的技能：

```python
# 技能 → MoA 预设映射
SKILL_MOA_MAP = {
    "review": "review_moa",      # 方案评审 → 3专家（功能/甲方/成本）+ 聚合
    "compete": "compete_moa",    # 竞品分析 → 3专家（市场/设计/技术）+ 聚合
    "concept": "concept_moa",    # 概念激发 → 3专家（创新/落地/甲方）+ 聚合
    "compare": "compare_moa",    # 方案比选 → 3专家（功能/成本/效果）+ 聚合
    # 其余走单模型
}
```

当用户触发 `review`/`compete`/`concept`/`compare` 时，后端判断：
- 如果用户设置中开启 MoA 模式 → 调用 `moa.run_moa_sync()`
- 否则 → 调用现有单模型 `_run_skill_inner()`

---

## 三、前端技术方案：如何将 DC 设计转为 React 组件

### 3.1 问题：`共创营地.dc.html` 使用 DC 框架

这个文件使用了一个叫 "DC" 的自定义框架（从 `support.js` 看，是 React 的封装），使用 `React.createElement` 而非 JSX，且依赖 `DCLogic` 基类。

**方案**：不要试图直接复用 DC 运行时。把它的**视觉设计和交互逻辑**翻译成标准的 React 组件（Vite + Tailwind）。

### 3.2 需要翻译的前端模块

从 `共创营地.dc.html` 中提取以下组件：

```
CampLayout                    # 整体布局（侧边栏 + 主区域）
├── Sidebar                   # 左侧导航
│   ├── NavItem               # 项目中心/数据基地/共创营地...
│   └── RecentCoCreation      # 最近共创列表
├── HeroView                  # 首页（ASK/AGENTS 切换）
│   ├── TabSwitcher           # ASK / AGENTS 切换
│   ├── Composer              # 底部输入框
│   ├── ScenarioCardGrid      # 场景卡片网格
│   │   └── ScenarioCard      # 单个场景卡（复盘/概念/工作流/汇报）
│   └── SkillLibraryEntry     # "浏览全部技能"入口
├── SkillLibraryView          # 技能库全屏
│   ├── CategoryNav           # 分类导航（全部/概念/竞品...）
│   └── SkillCardGrid         # 技能卡片网格
│       └── SkillCard         # 单个技能卡
├── ConversationView          # 对话界面
│   ├── MessageHeader         # 顶部栏（who + tag）
│   ├── MessageBubble         # 消息气泡（用户/AI）
│   ├── ItemList              # 结构化列表（时间线/任务/步骤）
│   ├── ActionBar             # 操作按钮（复制/确认/刷新/点赞）
│   ├── FollowUpList          # 追问按钮列表
│   └── Composer              # 底部输入框
└── MoAReviewPanel            # MoA 评审结果展示（新增）
    ├── ScoreStats            # 整体评分/风险/通过率/成本
    ├── ExpertPanel           # 三专家意见摘要
    ├── ChecklistView         # 六维度检查清单
    ├── ConflictView          # 冲突意见
    └── ActionPanel           # 确认/重新评审/导出
```

### 3.3 设计 Token 映射（前端 DC → React Tailwind）

| DC 样式 | Tailwind 等价 | 备注 |
|---------|--------------|------|
| `background: #030406` | `bg-[#030406]` | 主背景 |
| `background: #07080c` | `bg-[#07080c]` | 卡片背景 |
| `border: 1px solid rgba(255,255,255,.08)` | `border border-white/10` | 卡片边框 |
| `color: #7c5cff` | `text-[#7c5cff]` | 紫色强调（概念） |
| `color: #42a5ff` | `text-[#42a5ff]` | 蓝色强调（竞品） |
| `color: #d7a86e` | `text-[#d7a86e]` | 金色强调（文本） |
| `color: #36e6d4` | `text-[#36e6d4]` | 青色强调（出图） |
| `color: #ff5e66` | `text-[#ff5e66]` | 红色强调（审查） |
| `borderRadius: 18px` | `rounded-[18px]` | 卡片圆角 |
| `backdrop-filter: blur(26px)` | `backdrop-blur-xl` | 毛玻璃效果 |
| `font-family: 'Space Grotesk'` | `font-sans`（引入字体） | 西文字体 |
| `font-family: 'Noto Sans SC'` | `font-sans` | 中文字体 |

### 3.4 字体加载

```html
<!-- index.html 中引入 Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
```

```js
// tailwind.config.js
theme: {
  fontFamily: {
    sans: ['"Space Grotesk"', '"Noto Sans SC"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
  }
}
```

---

## 四、状态管理与数据流

### 4.1 前端状态结构

```typescript
interface CampState {
  // 当前视图
  view: 'hero' | 'skills' | 'conversation' | 'moa_review';
  
  // 当前激活的 Tab（ASK / AGENTS）
  activeTab: 'ask' | 'agents';
  
  // 当前对话上下文
  conversation: {
    skillId: string | null;      // 当前技能ID
    agentId: string | null;      // 当前智能体ID
    messages: Message[];         // 消息列表
    isLoading: boolean;           // 是否正在生成
    mode: 'single' | 'moa';       // 单模型 / MoA 模式
  };
  
  // 技能执行结果（缓存）
  lastResult: {
    skillId: string;
    resultId: number;
    content: string;
    outputJson: any;
    isMoa: boolean;               // 是否 MoA 结果
    moaSummary?: MoASummary;     // MoA 摘要（评分/专家/成本）
  } | null;
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'expert';
  content: string;
  expertRole?: string;           // 专家角色（MoA 时）
  timestamp: Date;
  items?: ScenarioItem[];       // 结构化列表（如时间线/任务）
  followUps?: string[];          // 追问建议
}

interface MoASummary {
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  passRate: number;
  totalCost: number;             // 元
  totalLatency: number;         // 毫秒
  expertCount: number;
}
```

### 4.2 数据流

```
用户点击技能卡
  → 前端设置 view='conversation', conversation.skillId='review'
  → 前端发送 POST /api/projects/{id}/skills/{skill_id}/run
  → 后端判断：该技能是否走 MoA？
    → 是 → 调用 moa.run_moa_sync()
      → 并发调用 3 个参考模型
      → 调用聚合模型
      → 保存 MoAChain
      → 返回 {success, final_output, reference_outputs, cost}
    → 否 → 调用现有 _run_skill_inner()
      → 保存 SkillResult
      → 返回 {skill_id, status, content, output_json}
  → 前端接收结果
    → 如果是 MoA 结果 → 展示 MoAReviewPanel（检查清单/专家意见）
    → 如果是单模型 → 展示 ConversationView（对话气泡）
  → 用户可执行操作（生成任务/导出/重新评审）
```

---

## 五、API 接口变更清单

### 5.1 现有接口（无需改动）

```
GET  /api/skills                              → 技能目录
POST /api/projects/{id}/skills/{skill_id}/run  → 技能执行
GET  /api/projects/{id}/skill-results          → 成果历史
POST /api/projects/{id}/review-precheck        → 评审预检
POST /api/chat                                 → 自由对话
GET  /api/agents                               → 智能体列表
```

### 5.2 新增/扩展接口

```
# 1. 技能执行扩展（在 skills.py 中）
POST /api/projects/{id}/skills/{skill_id}/run
  请求体新增：
  {
    "session_id": 0,
    "input": "...",
    "mode": "auto" | "single" | "moa",   // 新增：调度模式
    "audience": "...",
    "image_prompt": "...",
    "ref_asset_ids": []
  }

# 2. MoA 评审（已存在）
POST /api/review-checklist/moa
  → 返回完整 MoA 链路（含专家意见）

# 3. MoA 竞品分析（新增）
POST /api/compete-checklist/moa
  → 类似 review-checklist，但用于竞品分析

# 4. 技能执行结果扩展（返回 MoA 信息）
  响应体新增：
  {
    "skill_id": "review",
    "status": "ok",
    "title": "方案评审",
    "content": "...",
    "output_json": "...",
    "is_moa": true,                          // 新增
    "moa_summary": {                         // 新增
      "overall_score": 78,
      "risk_level": "medium",
      "pass_rate": 0.75,
      "total_cost_yuan": 0.13,
      "total_latency_ms": 8200,
      "expert_count": 3
    },
    "sources": [...],
    "model": "deepseek-reasoner"
  }

# 5. 设置接口扩展（新增 MoA 配置）
GET  /api/settings/moa
  → 返回 MoA 配置（参考模型、聚合模型、预算上限）
PUT  /api/settings/moa
  → 更新 MoA 配置
```

### 5.3 后端最小改动

为了保持后端稳定，**不新增路由**，只扩展现有接口：

1. **`skills.py`** 的 `SkillRunIn` schema 添加 `mode` 字段（可选，`auto`/`single`/`moa`）
2. **`skills.py`** 的 `SkillRunOut` schema 添加 `is_moa` 和 `moa_summary` 字段
3. **`skills.py`** 的 `_run_skill_inner` 在 `skill_id in ("review", "compete")` 时判断 mode，走 MoA 或单模型
4. **`skills.py`** 扩展 `_SKILLS` 和 `_SKILL_PROMPTS` 列表，添加 14 个新技能的元数据（prompt 走通用文本输出）
5. **`moa.py`** 新增 `compete_moa` 预设（对标 `review_moa` 的结构）

---

## 六、分阶段实施计划

### Phase 1：前端骨架 + 后端接口扩展（1 周）

**目标**：让新前端"跑起来"，能调用后端现有能力。

| 任务 | 文件 | 说明 |
|------|------|------|
| 创建 React 组件骨架 | `frontend/src/pages/CampPage.tsx` | 整体布局（Sidebar + Main） |
| 创建 HeroView | `frontend/src/components/camp/HeroView.tsx` | ASK/AGENTS 切换 + 场景卡 |
| 创建 SkillLibraryView | `frontend/src/components/camp/SkillLibraryView.tsx` | 技能库全屏 |
| 创建 ConversationView | `frontend/src/components/camp/ConversationView.tsx` | 对话界面 |
| 扩展后端技能列表 | `backend/app/routers/skills.py` | 添加 14 个新技能的元数据 |
| 扩展后端 Schema | `backend/app/schemas.py` | SkillRunIn/Out 添加 mode/is_moa |

**验收标准**：
- 前端能展示 20 个技能卡片
- 点击技能能调用后端并展示结果
- 原有 6 个技能功能不变

### Phase 2：MoA 集成（3-5 天）

**目标**：让 `review`/`compete` 技能支持 MoA 模式。

| 任务 | 文件 | 说明 |
|------|------|------|
| 创建 MoAReviewPanel | `frontend/src/components/camp/MoAReviewPanel.tsx` | 三专家/检查清单/冲突意见 |
| 完善后端 MoA 调度 | `backend/app/moa.py` | 添加 compete_moa 预设 |
| 扩展 skills.py 执行 | `backend/app/routers/skills.py` | review/compete 走 MoA 逻辑 |
| 创建设置页 | `frontend/src/components/settings/MoASettings.tsx` | 模式切换/预算配置 |

**验收标准**：
- 触发 review 时，能看到三专家意见
- 检查清单按六维度展示
- 冲突意见高亮显示
- 成本信息展示（¥0.13/次）

### Phase 3：新增技能落地（3-5 天）

**目标**：让新增技能（concept/massing/shotlist 等）可用。

| 任务 | 说明 |
|------|------|
| 添加新技能 prompt | 在 `_SKILL_PROMPTS` 中添加通用指令 |
| 测试每个新技能 | 验证输出质量 |
| 前端展示优化 | 为不同技能定制展示方式（如 shotlist 展示为分镜列表） |

**验收标准**：
- 20 个技能全部可点击执行
- 输出质量可接受（不要求完美，但方向正确）

### Phase 4： polish + 数据回流（2-3 天）

**目标**：让共创营地的产出能回流到项目中心/数据基地。

| 任务 | 说明 |
|------|------|
| "回流项目中心"按钮 | 把成果一键写入 ProjectAnalysis/SkillResult |
| "生成任务"按钮 | 把 MoA 的不通过项一键生成 TeamAssignment |
| "导出报告"按钮 | 生成 .docx / .pdf 报告 |
| 最近共创列表 | 侧边栏显示最近 3-5 次共创记录 |

---

## 七、关键设计决策

### 7.1 为什么不直接复用 `共创营地.dc.html`？

| 问题 | 说明 |
|------|------|
| DC 框架依赖 | `support.js` 是一个自定义运行时（1600+ 行），需要 DC 解析器、React 18 兼容层，引入不确定性 |
| 无 JSX | 使用 `React.createElement` 写界面，开发效率低，团队成员难以维护 |
| 无类型安全 | 没有 TypeScript，后期维护困难 |
| 与现有前端冲突 | ROM-AI 前端已用 Vite + React + Tailwind + shadcn/ui，引入 DC 会制造两套体系 |

**结论**：提取 DC 设计的**视觉风格**（配色/圆角/阴影/动画）和**交互结构**（ASK/AGENTS/技能库/对话），用标准 React + Tailwind 重写。

### 7.2 为什么新增技能走通用文本输出？

| 技能 | 是否需要结构化输出 |
|------|-------------------|
| `review` | ✅ 需要（检查清单/通过/不通过） |
| `compete` | ✅ 需要（对标矩阵/维度评分） |
| `task` | ✅ 需要（任务/负责人/优先级） |
| `ppt` | ✅ 需要（页标题/要点/备注） |
| `meeting` | ✅ 需要（五段式纪要） |
| `concept` | ❌ 不需要（头脑风暴，文本即可） |
| `massing` | ❌ 不需要（体量分析，文本即可） |
| `shotlist` | ❌ 不需要（视角脚本，文本即可） |
| `moodboard` | ❌ 不需要（材质建议，文本即可） |

**结论**：新增 14 个技能中，只有 1-2 个（如 `compare` 方案比选）可能需要结构化。其余走通用文本 + Markdown 即可。这样大幅降低后端开发成本。

### 7.3 MoA 的默认策略

```
用户设置：
├── 调度模式：auto（默认）/ single / moa
│   ├── auto：系统按技能复杂度自动选择
│   │   ├── review/compete → MoA
│   │   ├── concept/compare → MoA（可选）
│   │   ├── ppt/meeting/task → 单模型
│   │   └── 其余 → 单模型
│   ├── single：所有技能走单模型
│   └── moa：所有技能走 MoA（不推荐，成本高）
│
└── 预算上限：¥2.0/次（默认）
```

---

## 八、前端 → 后端对接清单（详细）

### 8.1 场景卡点击后的后端调用

```typescript
// 前端：点击"复盘进度"场景卡
const handleScenarioClick = (scenarioId: string) => {
  switch (scenarioId) {
    case 'review':
      // 调用后端：POST /api/projects/{id}/skills/review/run
      // 或 POST /api/review-checklist/moa（如果用户开启 MoA）
      break;
    case 'concept':
      // 调用后端：POST /api/projects/{id}/skills/concept/run
      // 或 POST /api/chat（自由对话模式）
      break;
    case 'flow':
      // 调用后端：POST /api/projects/{id}/skills/task/run
      break;
    case 'brief':
      // 调用后端：POST /api/projects/{id}/skills/ppt/run
      break;
  }
};

// 前端：点击"方案领航员"Agent 卡
const handleAgentClick = (agentId: string) => {
  switch (agentId) {
    case 'pilot':
      // 调用后端：POST /api/chat（Agent 模式）
      // 或 POST /api/projects/{id}/skills/concept/run
      break;
    case 'scout':
      // 调用后端：POST /api/projects/{id}/skills/compete/run
      break;
    case 'writer':
      // 调用后端：POST /api/projects/{id}/skills/ppt/run
      break;
    case 'judge':
      // 调用后端：POST /api/projects/{id}/skills/task/run
      break;
  }
};
```

### 8.2 对话界面的消息渲染策略

```typescript
// 根据 skill_id 和返回数据，决定渲染什么组件
const renderMessage = (msg: Message) => {
  if (msg.role === 'user') {
    return <UserBubble content={msg.content} />;
  }
  
  if (msg.isMoa && msg.skillId === 'review') {
    return <MoAReviewPanel data={msg.outputJson} />;
  }
  
  if (msg.skillId === 'ppt') {
    return <PPTOutlineCard data={msg.outputJson} />;
  }
  
  if (msg.skillId === 'task') {
    return <TaskListCard data={msg.outputJson} />;
  }
  
  if (msg.skillId === 'meeting') {
    return <MeetingMinutesCard data={msg.outputJson} />;
  }
  
  // 通用文本输出
  return <AssistantBubble content={msg.content} />;
};
```

---

## 九、总结：改动范围估算

### 后端改动（最小化）

| 文件 | 改动量 | 说明 |
|------|--------|------|
| `schemas.py` | +20 行 | SkillRunIn/Out 添加 mode/is_moa/moa_summary |
| `skills.py` | +60 行 | 扩展 _SKILLS/_SKILL_PROMPTS，review/compete 走 MoA 分支 |
| `moa.py` | +50 行 | 添加 compete_moa 预设 |
| `models.py` | 0 行 | 复用现有 SkillResult，不新增表（MoAChain 已存在） |

**后端总计：~130 行代码，风险极低。**

### 前端改动（主要工作）

| 文件 | 工作量 | 说明 |
|------|--------|------|
| `CampPage.tsx` | M | 整体布局（Sidebar + Main） |
| `HeroView.tsx` | M | ASK/AGENTS 切换 + 场景卡 |
| `SkillLibraryView.tsx` | M | 技能库全屏（5 分类 × 20 技能） |
| `ConversationView.tsx` | M | 对话界面（气泡/列表/操作） |
| `MoAReviewPanel.tsx` | M | MoA 评审展示（评分/专家/清单/冲突） |
| `Composer.tsx` | S | 底部输入框 |
| 其他小组件 | S | 图标/按钮/徽章等 |

**前端总计：~1500-2000 行代码，主要工作量。**

---

> **下一步**：确认这个思路后，按 Phase 1 → Phase 2 → Phase 3 → Phase 4 的顺序执行。每个阶段完成后验收再继续。

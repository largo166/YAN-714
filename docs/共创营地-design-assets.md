# 共创营地 · 设计资产提取（来自 DC 稿）

> 来源：`共创营地.dc.html`（DC 运行时 `support.js` 渲染的设计稿）。
> 性质：**视觉/交互设计稿 + 假数据 mock**（场景、对话内容均为襄阳投标演示数据，非真实功能）。
> 用途：作为「共创营地」React 重写的视觉与交互参照。**不复用 DC 运行时**（自定义 React.createElement 运行时，与 Vite+React+Tailwind 冲突）。

---

## 1. 配色

**主色板（DC 暗色霓虹）**
| 角色 | 值 | 用途 |
|---|---|---|
| 紫(主) | `#7c5cff` | 品牌主色 / `--accent` / 概念类 |
| 蓝 | `#42a5ff` | 竞品研究类 / 协同 |
| 金 | `#d7a86e` | 文本汇报类 |
| 青 | `#36e6d4` | 出图表现类 / 推荐态 |
| 红 | `#ff5e66` | 审查合规类 / 高风险 |
| 琥珀 | `#fdab3d` | 警告 / 进行中 / 逾期风险 |

**底色 / 文字 / 表面**
- 背景：`#030406`→`#07080c` 深近黑 + 三处径向渐变(紫/蓝/金)叠加；`body::before` 48px 网格 + 顶部 mask。
- 文字：`#f4f1ea`(主) / `#d8d4cc` / `#8f96a5`(次) / `#5f6674`(更次) / `#b9bdcc`。
- 玻璃面：`rgba(255,255,255,.06)` 卡面、`rgba(255,255,255,.08)` 描边、`backdrop-filter:blur(26px)`。

**分类色（5 类）**：概念与方案 `#7c5cff` · 竞品与研究 `#42a5ff` · 文本与汇报 `#d7a86e` · 出图与表现 `#36e6d4` · 审查与合规 `#ff5e66`。

> ⚠ **与 ROM-AI 现状的关键冲突**：DC 稿是**暗色霓虹**；ROM-AI 现有全站是**暖色浅色**（`legacy-ui.css` 视觉权威：`--bg #faf9f5` 奶白 / `--terra #c2703a` 赭）。直接落暗色会让共创营地成为浅色 app 里的「暗色孤岛」，且与视觉权威冲突。**主题方向需先拍板**（见重写说明）。

---

## 2. 字体
- 字体栈：`'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei'`；`letter-spacing:-.01em`。
- 标题用 Space Grotesk + 渐变文字裁切（`background-clip:text`）。
- **与 ROM-AI 共享 Space Grotesk**（`legacy-ui.css` 也用）；差异：DC 用 Noto **Sans** SC，ROM-AI 用 Noto **Serif** SC。

---

## 3. 布局
- 顶层 grid：`264px 侧栏 + 1fr 主区`；`@media(max-width:1080px)` 折叠为单列、侧栏隐藏。
- **侧栏**：sticky 全高、暗玻璃、blur。结构：Logo(R 渐变块) → Workspace 导航(项目中心/数据基地/共创营地/协作平台/管理驾驶舱) → 最近共创列表 → 底部 "Co-creation" 宣传卡。
- **主区**：flex 列，三态视图切换（Hero / 技能库 / 对话）。

---

## 4. 组件清单（DC 稿里的函数 → 对应 React 组件）
| DC 函数 | 作用 | 重写为 |
|---|---|---|
| `brandMark(size)` | 渐变发光球 Logo（campGlow 动画） | `<BrandMark size>` |
| `card(c,kind)` | ASK/AGENT 卡（图标+标题+副标，hover 上浮） | `<SkillCard>` |
| `composer(big)` | 输入框（渐变描边 + 技能库「+」+ 模型选择 + 麦克风） | `<Composer>` |
| `hero()` | Logo + 对话共创/设计智能体 Tab + composer + 卡片栅格 + 浏览全部技能 | `<HeroView>` |
| `skillsView()` | 技能库浮层（分类导航 chips + 滚动分类栅格） | `<SkillLibraryView>` |
| `convoView()` | 对话（用户气泡 + 助手：lead+条目表+close+操作行+追问按钮）+ composer | `<ConversationView>` |

---

## 5. 交互
- **Tab 切换**：`对话共创(ask)` / `设计智能体(agents)`。
- 卡片点击 → `open(id)` → 进入对话视图（带该场景）。
- composer「+」→ `openSkills()` → 技能库浮层；技能卡点击 → `open(id)`。
- 对话视图：返回营地、**追问按钮(一键执行)**、操作行(复制/确认/加/重试/赞/踩)。
- 动效：`campRise`(淡入上浮) / `campGlow`(色相轮转)。

---

## 6. 技能分类法（DC 稿 5 类 × ~20 技能）
| 分类(色) | 技能 id | 标题 |
|---|---|---|
| 概念与方案(紫) | concept / massing / compare / facade | 概念激发 / 体量推敲 / 方案比选 / 立面生成 |
| 竞品与研究(蓝) | scout / caselib / condition | 竞品对标 / 案例库检索 / 规划条件解读 |
| 文本与汇报(金) | writer / brief / poster / slang | 投标文本 / 汇报提纲 / 一页纸海报 / 甲方黑话翻译 |
| 出图与表现(青) | director / shotlist / moodboard | 效果图导演 / 视角脚本 / 风格参考板 |
| 审查与合规(红) | review / judge / norm | 进度复盘 / 节点督办 / 规范审查 |
| (ASK 额外) | flow | 定义工作流 |
| (AGENTS) | pilot / scout / writer / judge | 方案领航员 / 对标研究员 / 文本起草官 / 节点督办官 |

**与后端现状（8 技能：ppt/img/review/task/meeting/compete/concept/compare）的映射注意**：
- `concept`/`compare` 已有；`scout/竞品对标`≈`compete`。
- ⚠ **命名冲突**：DC `review`=「进度复盘」，后端 `review`=「方案评审」——含义不同，不能直接套同名。
- 视觉类（massing/facade/director/shotlist/moodboard）更接近**生图**，不是纯文本 prompt。
- 专业类（condition 规划条件 / norm 规范审查）需要结构化/规范知识，纯文本 prompt 质量有限。

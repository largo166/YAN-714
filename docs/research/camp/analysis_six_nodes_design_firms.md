# ROM-AI 六个介入节点设计分析报告

> **报告性质**：基于国内外知名建筑设计事务所工作模式调研的系统设计分析
> **研究对象**：goa、gad、正像（国内）/ Foster、GMP、ZHA、BIG、SOM（国外）
> **分析基准**：ROM-AI 现有架构（五板块 / 16 节点 / A1-A8 认知模块 / B1-B6 跨项目库）
> **生成时间**：2026-06-28

---

## 执行摘要

本报告通过并行调研国内外 10+ 家知名建筑设计事务所的前期方案工作模式，结合 ROM-AI 现有系统架构的深度分析，对六个介入节点进行了**方法论依据 → 当前状态 → 数据模型 → 后端路由 → 前端组件 → 验收标准**的完整映射。

**核心发现**：

1. **六个节点与 ROM-AI 现有架构高度对应**——不是从零新建功能，而是在已有底座上"点亮"
2. **会议纪要是核心数据源**——五段式纪要已结构化提取了规划条件、甲方诉求、待办、知识条目所需的 80% 信息
3. **国内外事务所的核心差异在于"制度化 vs 人治化"**——Foster 的 Design Board、BIG 的比较矩阵、PMI 的 Lessons Learned 五步法，本质上都是把隐性经验转化为显性制度
4. **ROM-AI 的介入逻辑应遵循"人工确认不可省略"**——AI 负责提取和结构化，人负责判断和确认，这与国际通行的 QA/QC 独立评审员制度一致

**实施建议**：
- **P0（本周）**：⑤ 任务闭环 + ① 规划条件卡片 → 底座已通，纯点亮
- **P1（下周）**：③ 评审预检 + ④ 甲方画像 → 利用已有 slang/诉求翻译/结构化判断
- **P2（下月）**：② 竞品对标 + ⑥ 知识沉淀 → 需要构建新的聚合视图和模板层

---

## 第一部分：国内外设计事务所工作模式对比

### 一、调研方法论

本次调研采用**多源交叉验证**策略：
- **国内来源**：goa/gad 官网项目案例、广州市评审指引、行业数字化转型报告、招聘组织架构
- **国外来源**：Foster 官网 FRF 框架、BIG 学术分析、KPF 计算模型公开报道、RIBA Plan of Work、HOK 治理结构、学术论文（CUMINCAD / Springer 2026）
- **学术框架**：ISO/IEC/IEEE 42030、CBR（Case-Based Reasoning, Aamodt & Plaza 1994）、SECI 模型（Nonaka & Takeuchi）、Design Rationale（Lee & Lai 1991）

### 二、六维度对比矩阵

| 维度 | 国内事务所（goa/gad/正像） | 国外事务所（Foster/GMP/BIG/ZHA） | 核心差异 |
|------|---------------------------|----------------------------------|----------|
| **规划条件解读** | 信息分散（控规/出让条件/导则/口头），人工整理对照表 | BIG「极简文本+图形化」；KPF 计算模型 3 周测试 400+ 体量；RIBA 动态任务书（活文档） | 国内被动读取，国外主动解构+参数化测试 |
| **竞品对标** | 可类比项目分析，碎片化搜索，停留在视觉层面 | BIG「比较矩阵+杂交进化」；Bernard Tschumi 网格化比较；KPFui 城市数据分析 | 国内临时抱佛脚，国外制度化案例库+计算对标 |
| **方案评审** | 三级体系：内审→外审（5专家2/3投票）→专家会 | Foster Design Board + FRF 10 维度；HOK 多层委员会；独立高级评审员 | 国内人治（所长拍板），国外制度化（委员会+独立评审） |
| **甲方画像** | 三类甲方：地产/政府/企业，goa「倾听+合作+1:1」 | RIBA 客户类型矩阵；Foster「价值观对齐工作坊」；BIG「诉求极简转译」 | 国内经验导向，国外结构化框架（客户类型→设计驱动力） |
| **会议→任务** | Word/邮件下发，含"上次决议追踪"，但落实率低 | Asana/Monday + BIM 360 + Revit Issues；BIG Weekly Update 是核心机制 | 国内记录型纪要，国外行动型追踪+工具闭环 |
| **知识沉淀** | 文档管理→知识管理过渡，经验在个人脑中 | Foster「AI-native+数字孪生」；Herzog「归档即研究」；PMI Lessons Learned 五步法 | 国内项目结束即归档，国外项目结束即知识提取 |

### 三、对 ROM-AI 的六大启示

1. **从"照抄任务书"到"解构任务书"**——BIG 的 Brief Reduction 证明任务书不是指令而是素材，AI 应帮助设计师主动提炼、质疑、转化
2. **从"拍脑袋选方案"到"矩阵化决策"**——BIG 的比较矩阵 + KPF 的计算对标，证明方案比选需要结构化、透明化、可追溯
3. **从"所长看一眼"到"制度化审查"**——Foster 的 Design Board 和独立评审员制度，证明 QA 需要制度而非个人
4. **从"接任务书"到"共创任务书"**——RIBA 的 Reverse Brief 和 Foster 的价值观对齐，证明前期应主动对齐而非被动接受
5. **从"微信沟通"到"结构化任务管理"**——Asana/Monday + BIM 360 的闭环，证明会议纪要必须转化为 Action Items + Owner + Due Date
6. **从"项目结束即归档"到"项目结束即知识提取"**——PMI 五步法 + Foster 的 AI-native，证明知识管理的最后一步是"同化（Assimilation）"

---

## 第二部分：ROM-AI 系统架构总览

### 2.1 现有五板块架构

```
+-------------+  +-------------+  +-------------+  +-------------+  +-------------+
|   proj      |  |   know      |  |   agent     |  |    hub      |  |   boss      |
|  项目中心    |  |  数据基地    |  |  共创营地    |  |  协作平台    |  | 管理驾驶舱   |
|  (4D/4E)   |  | (4B/知识库)  |  | (AI对话/技能)|  | (团队/任务)  |  | (KPI/通知)  |
+-------------+  +-------------+  +-------------+  +-------------+  +-------------+
```

### 2.2 16 节点工作流（已定义）

```
brief(任务书) -> conditions(条件梳理) -> site(场地研究) -> user_program(使用者功能)
  -> cases(案例研究) -> core_problem(核心问题) -> concept(概念生成)
  -> spatial(空间策略) / massing(体量推演) / circulation(动线组织) / psf(平剖立)
  -> comparison(方案比选) -> representation(图面表达) / narrative(汇报叙事)
  -> review(评图反馈) -> archive(复盘入库)
```

### 2.3 关键数据模型（已完成）

| 模型 | 功能 | 与六个节点的关系 |
|------|------|-----------------|
| `Project` | 项目基础信息（含 client 字段） | ④ 甲方画像的主键 |
| `Meeting` / `MeetingMinute` | 会议记录 + 五段式纪要 | ①③④⑤⑥ 的数据源 |
| `ProjectCognition` | 结构化认知（A1-A8 模块） | ① 规划条件的新子槽位 |
| `TeamAssignment` | 团队分工（待扩展 status） | ⑤ 任务看板的底座 |
| `KnowledgeDocument` | 知识库文档（B1-B6 类型） | ⑥ 知识沉淀的落库目标 |
| `SkillResult` | 技能执行结果归档 | ② 竞品对标的历史数据 |
| `ProjectAnalysis` | AI 研判结果（5 任务） | ③ 评审预检的结构化判断底座 |

### 2.4 现有技能目录

```python
_SKILLS = [
    {"id": "ppt", "title": "PPT 大纲生成"},
    {"id": "img", "title": "AI 生图·意向图"},
    {"id": "review", "title": "方案评审"},       # <- ③ 评审预检的底座
    {"id": "task", "title": "任务安排生成"},     # <- ⑤ 任务提取的底座
    {"id": "meeting", "title": "会议纪要"},       # <- 核心数据源
    {"id": "compete", "title": "竞品分析"},       # <- ② 竞品对标的底座
]
```

### 2.5 已实现的甲方诉求能力

- `slang.py`：40+ 条甲方诉求翻译种子词典（原话/真实含义/设计影响/建议动作）
- `MeetingMinute.demand_internal_json`：对内版诉求翻译（潜台词）
- `MeetingMinute.demand_external_json`：对外版诉求翻译（正式口径）

---

## 第三部分：六个节点详细实现路径

### 节点①：规划条件解读（Planning Conditions）

#### 方法论依据

- **国内实践**：规划条件来源分散（控规/出让条件/城市设计导则/口头要求），goa 采用"整体思维"反推解决方案
- **国外实践**：BIG「极简文本+图形化转译」；KPF 计算模型参数化测试；RIBA「动态任务书（活文档）」
- **学术支撑**：ISO/IEC/IEEE 42030 约束分析框架；Pena《Problem Seeking》"先解题、后求解"；BriefBuilder 结构化需求模型

#### 当前状态

- ROM-AI 的 `conditions` 是**纯过程节点**（无 cognition_module），尚未实现结构化认知抽取
- `ProjectCognition` 已有 A1（brief）/ site_research / user_program 等模块，但 conditions 未被纳入 A 类认知模块
- `ProjectFile` 已支持 pdf/docx/txt/md 解析，可提取文本内容（含 NFKC 归一化）
- `parsing.py` 已处理 PDF 异体字问题

#### 数据模型

```python
# 方案 A：在 ProjectCognition 新增 A1.1 子槽位
class ProjectCognition:
    module: "planning_conditions"  # 新增 A1.1 模块
    fields_json:  # 受控字段数组
      - key: "land_area"         label: "用地面积"       extractable: "high"
      - key: "plot_ratio"        label: "容积率"         extractable: "high"
      - key: "building_density"  label: "建筑密度"       extractable: "high"
      - key: "height_limit"      label: "建筑限高"       extractable: "high"
      - key: "setback"           label: "退界要求"       extractable: "high"
      - key: "green_space_ratio" label: "绿地率"         extractable: "high"
      - key: "parking_ratio"     label: "车位配比"       extractable: "medium"
      - key: "land_use"          label: "用地性质"       extractable: "high"
      - key: "special_notes"     label: "特殊要求"       extractable: "low"   # 如地下步道、视线通廊
      - key: "regulatory_refs"  label: "条文出处"       extractable: "medium"  # 控规第X条
```

> **设计决策**：不新建独立表，复用 `ProjectCognition` 的 extractable 四档抽取 + 人工确认机制。规划条件作为 A1.1 模块，与 A1（brief）互补——A1 聚焦任务书诉求，A1.1 聚焦法规约束。

#### 后端路由

```python
# routers/planning_conditions.py (~80 行)
@router.post("/{project_id}/cognition/planning_conditions/extract")
def extract_planning_conditions(project_id: int, db: Session = Depends(get_db)):
    """从项目文件（规划条件 PDF/通知）自动提取结构化规划条件。
    步骤：1) 检索项目内所有文件（优先文件名为"规划条件""控规""设计条件"）
         2) 拼接文本上下文 -> RAG 装配
         3) 调用 AI 按 A1.1 字段规格抽取
         4) 返回 draft 状态认知（不自动 confirmed）
    """

@router.get("/{project_id}/cognition")
def get_cognitions(project_id: int, db: Session = Depends(get_db)):
    """已存在，返回所有认知（含新增 planning_conditions）"""

@router.post("/{project_id}/cognition/{cog_id}/confirm")
def confirm_cognition(project_id: int, cog_id: int, db: Session = Depends(get_db)):
    """已存在，人工确认后 status=draft -> confirmed"""
```

#### 前端组件

```
PlanningConditionsCard
├── 文件上传区（拖拽规划条件 PDF）
├── 提取按钮 -> 调用 extract
├── 结构化卡片（逐字段显示：key / value / status / 来源出处）
├── 人工编辑按钮（每字段可改 value + status）
├── 合规校验徽章（实时计算：容积率是否合规、限高是否合规等）
└── 版本快照（每次重抽前自动存版本，可回溯）
```

#### 验收标准

1. 上传规划条件 PDF -> 自动提取 >=8 个关键字段（准确率 >=80%）
2. 提取结果状态 = draft，需人工确认后才可被下游消费
3. 确认后的规划条件可在项目中心 KPI 卡中显示核心指标
4. 支持多地块项目：自动识别地块间关联约束（如交通通廊）

---

### 节点②：竞品对标（Benchmark / Comparator Analysis）

#### 方法论依据

- **国内实践**：可类比项目分析，对标维度包括项目概况、市场定位、硬件指标、销售对策；但案例收集碎片化
- **国外实践**：BIG「比较矩阵+杂交进化」；Bernard Tschumi 网格化比较；KPF 计算模型多方案优化
- **学术支撑**：CBR（Case-Based Reasoning, Aamodt & Plaza 1994）四阶段循环：Retrieve -> Reuse -> Revise -> Retain；Benchmarking Matrix 方法论

#### 当前状态

- `skills.compete` 已存在，prompt 为："从材料与知识库中找出类比项目，做对标分析：可比维度、各自做法、对本项目的借鉴"
- `cross_project` 库已有 B1-B6 类型：case_study / spatial_strategy / massing_operation / representation / typology / design_method
- `KnowledgeDocument` 全局 FTS5 可检索
- 竞品分析结果已归档到 `SkillResult`，但**未按场景分类沉淀为可复用资产**

#### 数据模型

```python
# 方案：扩展 B7 竞品类别（或复用 B1 case_study + 增强 schema）
# 核心数据：BenchmarkComparison（新轻表或复用 SkillResult.output_json）

# 建议：复用 SkillResult + 新增 benchmark 专用 schema
class BenchmarkComparison:
    """一次竞品对标分析的结构化结果。"""
    project_id: int           # 本项目
    target_case_ids: List[int] # 对标案例（KnowledgeDocument.id）
    dimensions: [             # 对标维度（BIG 框架本土化）
      {"dim": "context",       "label": "环境语境",       "weight": 0.15},
      {"dim": "massing",       "label": "体量关系",       "weight": 0.20},
      {"dim": "typology",      "label": "类型学",         "weight": 0.15},
      {"dim": "program",       "label": "功能分布",       "weight": 0.15},
      {"dim": "circulation",   "label": "流线组织",       "weight": 0.10},
      {"dim": "materiality",   "label": "材料性",         "weight": 0.10},
      {"dim": "sustainability","label": "可持续性",       "weight": 0.10},
      {"dim": "economy",       "label": "经济性",         "weight": 0.05},
    ]
    scores: [                 # 评分矩阵（本项目 vs 各竞品）
      {"case_id": 123, "case_name": "XX项目", "scores": {"context": 8, "massing": 7, ...}}
    ]
    radar_chart_data: dict    # 供前端渲染雷达图
    lessons: List[str]       # 对本项目的借鉴建议
    status: "draft" | "confirmed"
```

> **设计决策**：不新建独立表，复用 `SkillResult.output_json` 存储结构化对标结果。新增 `cross_project` 类别 `benchmark_case`（B7 或复用 B1），沉淀已确认的对标案例关联。

#### 后端路由

```python
# routers/benchmark.py (~100 行)
@router.post("/{project_id}/skills/compete/run")
def run_compete_analysis(project_id: int, payload: dict, db: Session = Depends(get_db)):
    """已存在。扩展：支持指定对标案例（从知识库中选择）+ 输出结构化对比矩阵。"""

@router.post("/{project_id}/benchmark")
def create_benchmark(project_id: int, payload: BenchmarkCreateIn, db: Session = Depends(get_db)):
    """手动创建/编辑对标分析（指定竞品 + 填写维度评分）。"""

@router.get("/{project_id}/benchmark")
def get_benchmark(project_id: int, db: Session = Depends(get_db)):
    """读取本项目的对标分析报告。"""

@router.post("/{project_id}/benchmark/{bm_id}/confirm")
def confirm_benchmark(project_id: int, bm_id: int, db: Session = Depends(get_db)):
    """人工确认后，将对标案例沉淀到 cross_project 库（B1 case_study）。"""
```

#### 前端组件

```
BenchmarkPanel
├── 竞品选择器（从知识库搜索/选择对标项目）
├── 维度配置器（可增删维度、调整权重）
├── 数据录入表格（逐行：竞品名称 + 各维度评分）
├── AI 辅助提取按钮（自动从竞品资料提取各维度评分）
├── 雷达图可视化（Recharts RadarChart）
├── 对比矩阵表格（含差距分析列）
├── 借鉴建议编辑区
└── 确认/沉淀按钮（确认后入库 cross_project）
```

#### 验收标准

1. 支持从知识库选择 2-5 个竞品，生成对比矩阵
2. 支持 >=6 个对标维度的量化评分（1-10 分）
3. 自动生成雷达图 + 差距分析
4. 确认后可一键沉淀到跨项目库（case_study 类型）
5. 竞品分析可被 PPT 生成技能引用（自动插入对比页）

---

### 节点③：方案评审预检（Design Review Pre-check）

#### 方法论依据

- **国内实践**：三级评审体系（内审->外审->专家会）；评审维度覆盖功能、日照、交通、造价、消防、城市风貌、绿建
- **国外实践**：Foster Design Board + FRF 10 维度；HOK 多层委员会；独立高级评审员制度；分阶段 QA/QC checklist
- **学术支撑**：ISO/IEC/IEEE 42030 架构评估框架；Universal Design 三层级模型（物理-空间/感官-认知/社会）；六维评审框架（功能/空间/形式/技术/经济/可持续性/社会性）

#### 当前状态

- `skills.review` 已存在，prompt："分优点/待改进问题/具体建议三段，逐条说明依据"
- `structured_judgment.py` 已定义判断卡结构：core / points / actions / questions / detail
- `quality.py` 隐形质检层已运行（audit_fields），检查 confirmed 空值、来源缺失等
- **缺失**：没有固化的检查清单模板（checklist），评审是自由文本而非结构化逐项检查

#### 数据模型

```python
# 核心：ReviewChecklist（新轻表，或复用 ProjectAnalysis + 扩展）
class ReviewChecklist:
    """方案评审预检清单。基于王志鹏/严硕真实评审逻辑提取。"""
    project_id: int
    # 六类评审维度（国内评审实践 + 国际框架综合）
    categories: [
      {
        "category": "function",          "label": "功能匹配",
        "items": [
          {"item": "功能布局合理性", "pass": bool, "note": str},
          {"item": "空间流线效率",   "pass": bool, "note": str},
          {"item": "面积指标符合度", "pass": bool, "note": str},
        ]
      },
      {
        "category": "multi_profession",  "label": "多专业协调",
        "items": [
          {"item": "结构体系可行性", "pass": bool, "note": str},
          {"item": "机电设备空间",   "pass": bool, "note": str},
          {"item": "幕墙与立面系统", "pass": bool, "note": str},
        ]
      },
      {
        "category": "data_support",    "label": "数据支撑",
        "items": [
          {"item": "日照分析合规",   "pass": bool, "note": str},
          {"item": "消防疏散满足",   "pass": bool, "note": str},
          {"item": "节能指标达标",   "pass": bool, "note": str},
        ]
      },
      {
        "category": "sunlight",          "label": "日照采光",
        "items": [
          {"item": "大寒日日照时数", "pass": bool, "note": str},
          {"item": "采光系数满足",   "pass": bool, "note": str},
          {"item": "遮阳设计合理",   "pass": bool, "note": str},
        ]
      },
      {
        "category": "urban",            "label": "城市关系",
        "items": [
          {"item": "天际线协调性",   "pass": bool, "note": str},
          {"item": "街道界面连续性", "pass": bool, "note": str},
          {"item": "公共空间贡献",   "pass": bool, "note": str},
        ]
      },
      {
        "category": "cost",             "label": "造价控制",
        "items": [
          {"item": "单方造价控制",   "pass": bool, "note": str},
          {"item": "限额设计符合",   "pass": bool, "note": str},
          {"item": "可建性评估",     "pass": bool, "note": str},
        ]
      },
    ]
    overall_score: int      # 0-100
    pass_rate: float        # 通过项 / 总项
    risk_level: "low" | "medium" | "high"
    status: "draft" | "confirmed"
    ai_suggested: bool      # 是否 AI 辅助生成
```

> **设计决策**：复用 `ProjectAnalysis`（task="review"）存储评审预检结果，但扩展 `output_json` 的 schema 为 checklist 结构。新增独立的 `review_checklist.py` 路由，提供检查清单模板管理。质量检查复用 `quality.py`（增加 checklist 相关 audit 规则）。

#### 后端路由

```python
# routers/review_checklist.py (~120 行)
@router.post("/{project_id}/review-checklist/generate")
def generate_checklist(project_id: int, db: Session = Depends(get_db)):
    """基于项目类型（住宅/商业/办公/文化）+ 所在城市，自动生成本项目的评审检查清单。
    数据来源：
    1. 项目认知（brief/site/conditions）-> 提取项目类型、规模、区位
    2. 规划条件 -> 提取法规约束（日照、消防、绿地等）
    3. 城市评审标准库 -> 根据城市匹配当地评审关注点
    4. AI 填充 checklist 的 pass/note 字段（draft 状态）
    """

@router.get("/{project_id}/review-checklist")
def get_checklist(project_id: int, db: Session = Depends(get_db)):
    """读取当前项目的评审检查清单。"""

@router.put("/{project_id}/review-checklist/{item_id}")
def update_checklist_item(project_id: int, item_id: str, payload: dict, db: Session = Depends(get_db)):
    """人工逐项更新 pass/note，支持批量确认。"""

@router.post("/{project_id}/review-checklist/confirm")
def confirm_checklist(project_id: int, db: Session = Depends(get_db)):
    """人工确认整份清单。确认后：
    1. 未通过项自动生成 TeamAssignment（待办任务）
    2. 通过项作为质量记录归档
    """

@router.post("/{project_id}/review-checklist/run-skills-review")
def run_skills_review(project_id: int, db: Session = Depends(get_db)):
    """在提交评审前，自动运行 skills.review，将结构化判断卡与 checklist 对比，
    生成"N 项通过 / M 项需关注"的预检报告。"""
```

#### 前端组件

```
ReviewChecklistPanel
├── 项目类型自动识别（从 brief 认知读取）
├── 检查清单表格（6 大类 x 3 项 = 18 项，可扩展）
│   ├── 每行：检查项 | 标准依据 | AI 建议 | 人工勾选通过/不通过 | 备注
│   ├── 未通过项自动标红 + 生成任务按钮
│   └── 通过项自动标绿
├── 整体评分仪表盘（通过率、风险等级）
├── 生成 skills.review 按钮（调用 AI 辅助评审）
├── 与 skills.review 结果对比视图（判断卡 vs checklist 对齐）
└── 确认按钮（确认后未通过项自动进入任务看板）
```

#### 验收标准

1. 支持根据项目类型自动生成差异化检查清单（住宅/商业/办公/文化）
2. 覆盖 >=6 类评审维度，每类 >=3 个检查项
3. AI 辅助预检：运行 skills.review 后自动生成"N 项通过 / M 项需关注"报告
4. 未通过项可一键生成 TeamAssignment（进入任务看板）
5. 检查清单可复用为模板（不同项目可复制）

---

### 节点④：甲方画像库（Client Profiling）

#### 方法论依据

- **国内实践**：三类甲方（地产商/政府/企业），goa「倾听+合作+1:1」方法论；甲方诉求碎片化（会议纪要/微信/邮件）
- **国外实践**：RIBA 客户类型矩阵（Developer/Institutional/Government/Private）；Foster「价值观对齐工作坊」；BIG「诉求极简转译+新造词沟通」
- **学术支撑**：Design Brief Translation 三级模型（模糊愿望->功能描述->技术约束）；Client Requirements Management（Yu et al., 2010 PolyU）

#### 当前状态

- `Project.client` 字段已存储甲方名称（字符串）
- `slang.py` 已有 40+ 条甲方诉求翻译种子（原话/真实含义/设计影响/建议动作）
- `MeetingMinute.demand_internal_json` 已结构化提取甲方诉求（对内版）
- **缺失**：没有以甲方为聚合主键的画像视图；跨项目同一甲方的诉求/红线/历史未汇总

#### 数据模型

```python
# 方案：ClientProfile（新表，或聚合查询 + 前端视图）
# 建议：不新建表，用聚合查询 + 缓存实现（甲方 = Project.client 的聚合键）

class ClientProfileOut:
    """甲方画像（聚合视图，非独立表）。"""
    client_name: str                    # 甲方名称（如"保利"）
    client_type: "developer" | "government" | "enterprise" | "private"  # 类型推断
    project_count: int                  # 合作项目数
    total_area: float                   # 累计面积
    projects: List[ProjectSummary]      # 关联项目列表
    
    # 诉求画像（从 MeetingMinute.demand_internal_json 聚合）
    demands: [
      {"text": "要有高端感", "frequency": 3, "projects": ["项目A", "项目B"], "impact": "层高>=3.3m"},
      {"text": "成本控制", "frequency": 5, "projects": [...], "impact": "单方造价<=8000"},
    ]
    
    # 红线画像（高频未通过项 = 甲方敏感点）
    red_lines: [
      {"category": "日照", "note": "对大寒日日照时数要求极严格", "frequency": 2},
    ]
    
    # 决策风格（从会议纪要分析推断）
    decision_style: "数据驱动" | "经验导向" | "品牌优先" | "成本敏感" | "政治导向"
    
    # 汇报建议口径（复用 structured_judgment）
    report_tone: {
      "甲方版": "突出投资回报、产品溢价、去化逻辑",
      "高层版": "突出品牌影响、城市贡献、战略价值",
      "专家会版": "突出技术亮点、创新点、规范合规",
    }
    
    # 黑话词典（复用 slang.py）
    slang_terms: List[dict]  # 该甲方常用话术及其翻译
```

> **设计决策**：**不新建独立表**。甲方画像完全由聚合查询生成（`SELECT ... FROM projects WHERE client = ?` + `JOIN meetings` + `JOIN minutes`），确保数据单一来源。画像结果是"计算视图"而非"持久化数据"，避免画像与真实数据不一致。新增 `client_profile.py` 路由提供聚合查询端点。

#### 后端路由

```python
# routers/client_profile.py (~150 行)
@router.get("/clients")
def list_clients(db: Session = Depends(get_db)):
    """列出所有甲方（按 Project.client 去重），含合作项目数。"""

@router.get("/clients/{client_name}/profile")
def get_client_profile(client_name: str, db: Session = Depends(get_db)):
    """获取甲方画像（聚合查询）：
    1. 关联所有该甲方的项目
    2. 聚合所有项目的会议纪要 -> 提取诉求（demand_internal_json）
    3. 统计诉求频率、关联项目、设计影响
    4. 分析历史评审记录 -> 提取红线（高频未通过项）
    5. 推断决策风格（从用词模式、关注点分布）
    6. 返回汇报建议口径（按甲方类型匹配模板）
    """

@router.get("/clients/{client_name}/projects")
def get_client_projects(client_name: str, db: Session = Depends(get_db)):
    """该甲方的所有项目列表（时间线）。"""

@router.get("/clients/{client_name}/demands")
def get_client_demands(client_name: str, db: Session = Depends(get_db)):
    """该甲方跨项目的历史诉求（结构化）。"""

@router.get("/clients/{client_name}/report-tone/{audience}")
def get_report_tone(client_name: str, audience: str, db: Session = Depends(get_db)):
    """按汇报对象（甲方/高层/专家会）返回建议口径。
    复用 structured_judgment.py 生成 "汇报建议卡"（core/points/actions）。
    """
```

#### 前端组件

```
ClientProfileCard
├── 甲方基本信息（名称、类型、合作项目数、累计面积）
├── 项目时间线（横向时间轴，显示各项目关键节点）
├── 诉求词云（高频诉求可视化，可点击下钻）
├── 红线雷达（该甲方在各维度上的敏感程度）
├── 决策风格标签（数据驱动/经验导向/品牌优先等）
├── 汇报口径切换器（甲方版/高层版/专家会版）
│   └── 一键生成对应口径的汇报建议卡
├── 黑话词典（该甲方常用话术及翻译）
└── 相似甲方推荐（基于诉求模式聚类）
```

#### 验收标准

1. 输入甲方名称 -> 自动聚合该甲方所有项目、会议纪要、诉求
2. 提取 >=5 个高频诉求，显示频率和关联项目
3. 自动推断甲方类型（地产/政府/企业）和决策风格
4. 支持按"甲方版/高层版/专家会版"切换汇报口径，生成结构化建议卡
5. 相似甲方推荐（基于诉求模式聚类）

---

### 节点⑤：会议→任务闭环（Meeting -> Task Kanban）

#### 方法论依据

- **国内实践**：会议纪要 Word/邮件下发，含"上次决议追踪"，但落实率低；任务分配模糊（"这个再优化一下"）
- **国外实践**：Asana/Monday/Trello + BIM 360 + Revit Issues 闭环；BIG Weekly Update 是核心机制；结构化会议纪要（Action Items + Owner + Due Date）
- **学术支撑**：ISO 项目管理标准；PMBOK 行动项追踪；敏捷开发的 Kanban 方法论

#### 当前状态

- `MeetingMinute.todos_json` 已结构化提取待办（五段式纪要的第 5 段）
- `TeamAssignment` 表已存在（member_id / project_id / task_title / due）
- **关键缺失**：
  1. `TeamAssignment` 无 `status` 字段（无法流转）
  2. `TeamAssignment` 无 `source_minute_id`（无法追溯来源会议）
  3. 纪要确认时未把 `todos_json` 落成 `TeamAssignment`
  4. 无看板 UI

#### 数据模型

```python
# Alembic 0017：TeamAssignment 扩展
class TeamAssignment:
    # 已有字段
    id: int
    member_id: int
    project_id: int
    task_title: str
    due: str
    created_at: datetime
    
    # 新增字段
    status: "todo" | "in_progress" | "done" | "overdue" | "cancelled"  # 状态流转
    source_minute_id: int   # 来源会议纪要（追溯链）
    source_task_index: int  # 在 todos_json 中的索引（精确定位）
    done_at: datetime       # 完成时间
    notes: str              # 备注/回复
    priority: "low" | "medium" | "high" | "urgent"  # 优先级（从纪要提取或人工设定）
    assigner: str           # 分配人（从纪要 attendees 提取或默认项目经理）
```

> **设计决策**：**复用 `TeamAssignment` 加字段**（Alembic 0017），不新建 `tasks` 表。理由：TeamAssignment 的语义本来就是"任务分工"，只需增加 status/source/done_at 即可变为完整的任务追踪实体。避免表语义分裂。

#### 后端路由

```python
# routers/task.py (~200 行)
# 注意：现有 team.py 只有 GET/POST TeamAssignment，需要大幅扩展

@router.post("/{project_id}/minutes/{minute_id}/confirm")
def confirm_minute(project_id: int, minute_id: int, db: Session = Depends(get_db)):
    """会议纪要从 draft -> confirmed 时，自动将 todos_json 落成 TeamAssignment。
    步骤：
    1. 读取 todos_json（数组：每个元素含 task_title / owner / due / priority）
    2. 为每个 todo 创建 TeamAssignment（status=todo, source_minute_id=minute_id）
    3. 如果 owner 匹配 team_members.name，则绑定 member_id；否则留空（待分配）
    4. 返回创建的任务列表
    """

@router.get("/{project_id}/tasks")
def list_tasks(project_id: int, status: str = None, db: Session = Depends(get_db)):
    """项目任务列表（支持按状态过滤）。"""

@router.get("/tasks")  # 全局端点（协作平台用）
def list_all_tasks(status: str = None, project_id: int = None, db: Session = Depends(get_db)):
    """全局任务看板（所有项目）。"""

@router.patch("/tasks/{task_id}")
def update_task_status(task_id: int, payload: TaskStatusUpdate, db: Session = Depends(get_db)):
    """更新任务状态（todo -> in_progress -> done）。
    状态流转规则：
    - todo -> in_progress：任意
    - in_progress -> done：需填写完成备注
    - 任意 -> overdue：系统自动标记（due 过期且 status != done）
    - done -> todo：仅管理员可撤销
    """

@router.get("/tasks/overdue")
def get_overdue_tasks(db: Session = Depends(get_db)):
    """获取所有逾期任务（用于看板标红 + 提醒）。"""

@router.post("/tasks/{task_id}/remind")
def remind_task(task_id: int, db: Session = Depends(get_db)):
    """手动触发任务提醒（或系统自动提醒）。"""
```

#### 前端组件

```
TaskKanbanPanel
├── 看板视图（三列：待办 / 进行中 / 已完成）
│   ├── 每列：卡片拖拽（DnD）
│   ├── 卡片内容：任务标题 | 所属项目 | 负责人 | 截止日期 | 优先级徽章
│   ├── 逾期卡片：红色边框 + 闪烁提醒
│   └── 来源追溯：点击卡片 -> 跳转到对应会议纪要
├── 列表视图（表格：可排序、可过滤）
├── 日历视图（截止日期在日历上显示）
├── 项目过滤器（只看某项目 / 全局）
├── 状态统计（待办数 / 进行中数 / 已完成数 / 逾期数）
└── 批量操作（批量确认完成、批量设置优先级）
```

#### 验收标准

1. 会议纪要确认时，自动将 todos_json 落成 TeamAssignment（status=todo）
2. 支持看板拖拽流转（todo -> in_progress -> done）
3. 逾期任务自动标红（每日检查 due 字段）
4. 任务卡片显示来源会议纪要（点击跳转）
5. 支持项目级和全局级两种看板视图

---

### 节点⑥：设计知识沉淀（Design Knowledge Precipitation）

#### 方法论依据

- **国内实践**：文档管理向知识管理过渡，项目档案沉睡在服务器，缺乏标准化模板；知识在个人大脑中
- **国外实践**：Foster「AI-native+数字孪生」；Herzog「归档即研究」；PMI Lessons Learned 五步法（收集->排序->文档->沟通->同化）
- **学术支撑**：SECI 模型（Nonaka & Takeuchi）；Design Rationale 三级捕获（非正式/半正式/正式）；Experience Factory + CBR 四阶段循环；RCC 方法（Rationale Capture Cycle）

#### 当前状态

- `ProjectCognition` 支持 A1-A8 模块结构化认知，已确认认知可沉淀
- `cross_project.precipitate` 端点已存在：把 confirmed 认知沉淀到 `KnowledgeDocument`（B1-B6 类型）
- `KnowledgeDocument` 支持 FTS5 全文搜索
- `archive` 节点是认知模块（`project_review`），有受控字段
- **缺失**：
  1. 知识条目模板未定义（沉淀什么？四维度：决策背景/方案演变/失败教训/可复用经验）
  2. 一键沉淀入口 UI 未实现（前端未接 cross_project.precipitate）
  3. 数据基地搜索栏 UI 未实现（后端 `/api/knowledge/search` 已备）
  4. 人工确认节点（AI 提取候选 -> 人工确认 -> 入库）

#### 数据模型

```python
# 方案：复用 KnowledgeDocument，新增 type = "knowledge_entry"（或复用 B1-B6 + 扩展）
# 建议：新增 "knowledge_entry" 作为 KnowledgeDocument.type 的枚举值
# 四维度复盘模板作为 knowledge_entry 的 schema

class KnowledgeEntrySchema:
    """设计知识条目标准模板（四维度）。
    存于 KnowledgeDocument.content_text（markdown）+ 结构化元数据。"""
    
    # 基础信息
    title: str                    # 知识条目标题
    project_name: str             # 源项目
    module: str                   # 源认知模块（brief/site/concept...）
    category: str                 # 知识类别：decision_background / scheme_evolution / failure_lessons / reusable_experience
    
    # 四维度内容（markdown）
    decision_background: str      # 决策背景：为什么做这个决策？当时面临什么约束？
    scheme_evolution: str         # 方案演变：从方案 A 到方案 B 的演进过程，关键转折点
    failure_lessons: str          # 失败教训：哪些尝试失败了？原因是什么？如何避免？
    reusable_experience: str      # 可复用经验：什么策略/方法可以在其他项目复用？适用边界？
    
    # 结构化标签（用于检索和推荐）
    tags: List[str]               # 标签：项目类型、技术策略、材料、规范等
    design_philosophy: str        # 设计哲学锚点（如"梯坎策略""场地回应"）
    applicable_scenarios: str     # 适用场景描述
    verification_data: str        # 验证数据（如能耗模拟结果、造价数据）
    
    # 来源与追溯
    source_doc_id: int            # 来源 KnowledgeDocument.id
    source_cognition_id: int      # 来源 ProjectCognition.id
    created_by: str               # 创建人
    confirmed: bool               # 是否经人工确认
    
    # 复用追踪（闭环）
    reuse_count: int              # 被复用次数
    last_reused_project: str      # 最后被复用项目
```

> **设计决策**：**复用 `KnowledgeDocument`**，不新建 `knowledge_entries` 表。新增 `type="knowledge_entry"` 作为知识条目标识。结构化四维度内容存 `content_text`（markdown），元数据（tags/design_philosophy/applicable_scenarios）存 JSON 扩展字段。这样保持知识库的统一检索入口，避免知识碎片化。新增 `knowledge_entry.py` 路由提供条目模板管理和沉淀入口。

#### 后端路由

```python
# routers/knowledge_entry.py (~180 行)
@router.get("/knowledge-entry/template")
def get_entry_template(category: str = None):
    """获取知识条目模板（四维度）。
    支持类别：decision_background / scheme_evolution / failure_lessons / reusable_experience
    返回 markdown 模板，供前端渲染为表单。"""

@router.post("/projects/{project_id}/knowledge-entry/extract")
def extract_knowledge_entry(project_id: int, payload: dict, db: Session = Depends(get_db)):
    """从项目认知/会议纪要自动提取知识条目候选。
    步骤：
    1. 读取该项目的所有 confirmed 认知（ProjectCognition）
    2. 读取该项目的所有 confirmed 会议纪要（MeetingMinute）
    3. AI 分析：识别哪些内容具有跨项目复用价值
    4. 按四维度模板填充候选条目
    5. 返回 draft 状态候选列表（不自动入库）
    """

@router.post("/knowledge-entry")
def create_knowledge_entry(payload: KnowledgeEntryCreate, db: Session = Depends(get_db)):
    """人工确认后创建知识条目（落 KnowledgeDocument, type='knowledge_entry'）。"""

@router.get("/knowledge-entry")
def list_knowledge_entries(category: str = None, tag: str = None, db: Session = Depends(get_db)):
    """知识条目列表（支持按类别/标签过滤）。"""

@router.get("/knowledge-entry/{entry_id}")
def get_knowledge_entry(entry_id: int, db: Session = Depends(get_db)):
    """知识条目详情。"""

@router.get("/knowledge-entry/{entry_id}/similar-projects")
def get_similar_projects(entry_id: int, db: Session = Depends(get_db)):
    """推荐可复用该知识条目的相似项目（基于项目类型/区位/规模匹配）。"""

@router.post("/projects/{project_id}/knowledge-entry/recommend")
def recommend_knowledge_entries(project_id: int, db: Session = Depends(get_db)):
    """项目启动时，基于项目特征自动推荐相关知识条目。
    匹配维度：项目类型、区位、规模、甲方类型、设计策略关键词。
    """
```

#### 前端组件

```
KnowledgeEntryPanel
├── 知识条目模板选择（四维度：决策背景 / 方案演变 / 失败教训 / 可复用经验）
├── AI 自动提取区
│   ├── 选择源项目
│   ├── 点击"提取候选" -> 显示 AI 建议的候选条目
│   └── 每候选条目：标题 | 类别 | 置信度 | 编辑/确认/忽略按钮
├── 人工编辑表单（按四维度模板填写）
│   ├── 决策背景（markdown 编辑器）
│   ├── 方案演变（支持时间线可视化）
│   ├── 失败教训（支持分类标签）
│   └── 可复用经验（适用场景 + 验证数据）
├── 标签输入器（自动推荐标签）
├── 设计哲学锚点输入（如"梯坎策略"）
├── 确认入库按钮（确认后 type='knowledge_entry' 存入知识库）
└── 复用推荐（新项目的"相关经验"推荐卡片）

// 数据基地搜索栏（已存在后端，缺前端 UI）
KnowledgeSearchBar
├── 搜索输入框（支持自然语言）
├── 过滤条件：类别 | 标签 | 项目类型 | 时间范围
├── 搜索结果列表（标题 | 摘要 | 来源项目 | 标签）
└── 结果详情弹窗（完整 markdown 渲染）
```

#### 验收标准

1. 支持四维度知识条目模板（决策背景/方案演变/失败教训/可复用经验）
2. AI 自动提取候选条目（从 confirmed 认知/纪要中识别复用价值内容）
3. 候选条目需人工确认后才入库（不自动沉淀）
4. 知识条目支持 FTS5 全文搜索 + 标签过滤
5. 新项目启动时自动推荐相关知识条目（基于项目特征匹配）
6. 记录知识复用次数和最后复用项目（闭环追踪）

---

## 第四部分：关键设计决策

### 4.1 不新建独立模块

所有六个节点都融入现有五板块架构，所有新功能都是现有路由的扩展：

| 节点 | 现有底座 | 扩展方式 |
|------|----------|----------|
| ① 规划条件 | `ProjectCognition` (A1-A8) | 新增 A1.1 模块 |
| ② 竞品对标 | `SkillResult` + `cross_project` (B1-B6) | 扩展 output_json schema + 新增 B7 或复用 B1 |
| ③ 评审预检 | `ProjectAnalysis` (task="review") + `quality.py` | 扩展 output_json 为 checklist 结构 + 新增路由 |
| ④ 甲方画像 | `Project.client` + `MeetingMinute` + `slang.py` | 聚合查询 + 新增路由（无新表） |
| ⑤ 任务闭环 | `TeamAssignment` + `MeetingMinute.todos_json` | 加字段（Alembic 0017）+ 扩展路由 |
| ⑥ 知识沉淀 | `KnowledgeDocument` + `cross_project.precipitate` | 新增 type="knowledge_entry" + 模板层 |

### 4.2 会议纪要是核心数据源

大多数自动提取（规划条件、甲方诉求、任务、知识条目）都从会议纪要出发。理由：
- 五段式纪要已结构化提取了 `summary/core_items/demand_internal/demand_external/decisions/todos`
- 纪要确认后，下游可安全消费（红线：draft 不消费，confirmed 才消费）
- 一个会议纪要可同时触发多个下游动作：任务提取、诉求翻译、知识条目候选

### 4.3 人工确认节点不可省略

AI 提取的内容需人工确认后才入库，确保知识库准确性。这与国际最佳实践一致：
- Foster 的 Design Board：人工审查
- HOK 的独立高级评审员：非项目团队审查
- PMI Lessons Learned：人工审核后才进入知识库

ROM-AI 的红线：
- `ProjectCognition.status`：draft -> confirmed 需人工确认
- `MeetingMinute.review_status`：draft -> confirmed 需人工确认
- `KnowledgeDocument`：AI 提取的候选 -> 人工确认 -> 入库

### 4.4 每个节点独立验收

不追求大而全，做完一个就能独立交付价值。优先级：
- **P0（本周 ~10h）**：⑤ 任务闭环（底座最通、痛点最高频）-> ① 规划条件（信息结构化高）-> ⑥ 知识沉淀模板（主要是前端）
- **P1（下周 ~10h）**：③ 评审预检（复用 review 技能）-> ④ 甲方画像（聚合查询，无新表）-> ② 竞品对标（需要新的对比视图）

---

## 第五部分：实施路线图

### 第一阶段：P0 点亮（本周，~10h）

| 节点 | 任务 | 工作量 | 关键文件 |
|------|------|--------|----------|
| ⑤ 任务闭环 | Alembic 0017（TeamAssignment 加 status/source/done_at）+ 纪要确认时落库 + 看板 UI | M | `0017_task_status.py`, `task.py`, `TaskKanbanPanel.tsx` |
| ① 规划条件 | A1.1 字段规格 + extract 路由 + PlanningConditionsCard | M | `schemas.py` (MODULE_FIELD_SPECS), `cognition.py` (扩展), `PlanningConditionsCard.tsx` |
| ⑥ 知识模板 | 四维度模板定义 + 数据基地搜索栏 UI + 一键沉淀入口 | S-M | `knowledge_entry.py`, `KnowledgeSearchBar.tsx`, `KnowledgeEntryPanel.tsx` |

### 第二阶段：P1 建能力（下周，~10h）

| 节点 | 任务 | 工作量 | 关键文件 |
|------|------|--------|----------|
| ③ 评审预检 | 检查清单模板（6维度x3项）+ skills.review 联动 + 未通过项自动生成任务 | M | `review_checklist.py`, `ReviewChecklistPanel.tsx` |
| ④ 甲方画像 | 聚合查询端点 + 画像卡片 UI + 汇报口径切换 | M | `client_profile.py`, `ClientProfileCard.tsx` |
| ② 竞品对标 | 对比矩阵 schema + 雷达图 + 沉淀到 cross_project | M | `benchmark.py` (扩展 skills.compete), `BenchmarkPanel.tsx` |

### 第三阶段：P2 建资产（下月）

- 从 `SkillResult` 生图归档按场景分类沉淀可复用提示词
- 跨会议议题追踪（MeetingMinute 加 topic）
- 项目复盘模板（四维度自动聚合）
- OCR 引擎（扫描件转文本）
- PDF 缩略图预览

---

## 附录 A：六个节点与 ROM-AI 16 节点的映射关系

| 六个节点 | ROM-AI 16 节点 | 认知模块 | 技能 |
|----------|---------------|----------|------|
| ① 规划条件解读 | `conditions`（条件梳理） | A1.1 planning_conditions | - |
| ② 竞品对标 | `cases`（案例研究） | - | `compete` |
| ③ 方案评审预检 | `review`（评图反馈） | - | `review` |
| ④ 甲方画像库 | `brief`（任务书） + 会议纪 | - | - |
| ⑤ 会议->任务闭环 | `archive`（复盘入库）+ 协作 | - | `task` + `meeting` |
| ⑥ 设计知识沉淀 | `archive`（复盘入库） | project_review | `precipitate` |

## 附录 B：六个节点与国内外事务所工作模式的对应

| 六个节点 | 国内实践 | 国外实践 | ROM-AI 介入点 |
|----------|----------|----------|---------------|
| ① 规划条件 | 人工读控规，Excel 整理 | KPF 计算模型 400+ 方案 | 自动提取 + 合规校验 + 版本管理 |
| ② 竞品对标 | 碎片化搜索，视觉对比 | BIG 比较矩阵 + 杂交进化 | 智能案例推荐 + 量化对比矩阵 + 雷达图 |
| ③ 评审预检 | 三级评审，人治为主 | Foster Design Board + FRF | 检查清单模板 + AI 预审 + 意见结构化 |
| ④ 甲方画像 | 三类甲方，经验判断 | RIBA 客户类型矩阵 + 设计驱动力 | 诉求聚合 + 决策风格推断 + 汇报口径切换 |
| ⑤ 任务闭环 | Word 纪要，落实率低 | Asana/Monday + BIM 360 | 纪要自动提取 -> 看板 -> 状态流转 -> 逾期提醒 |
| ⑥ 知识沉淀 | 项目归档，人走茶凉 | PMI 五步法 + Foster AI-native | AI 候选提取 -> 人工确认 -> 结构化入库 -> 复用推荐 |

## 附录 C：参考来源

1. goa 大象设计官网项目案例（重庆启元、总部）
2. GAD 杰地设计项目案例（礼贤未来社区、宁波中心）
3. 广州市建筑景观设计方案评审工作指引
4. Foster + Partners 官网：Design Board / FRF 框架 / 可持续发展
5. BIG 学术分析：比较矩阵 + 杂交进化方法论
6. KPF Urban Interface (KPFui) 公开报道
7. RIBA Plan of Work 2020
8. Aamodt & Plaza (1994). Case-Based Reasoning: Foundational Issues
9. Nonaka & Takeuchi (1995). The Knowledge-Creating Company
10. Pena et al. Problem Seeking: An Architectural Programming Primer
11. ISO/IEC/IEEE 42030:2019 Architecture Evaluation Framework
12. PMI Lessons Learned Best Practices
13. de Jong et al. (2019). Evaluating Design Rationale in Architecture
14. Park, S.Y. (2026). Architectural Design in the Age of Generative AI. Springer
15. ROM-AI 权威库：C:\ROM-AI-Claude 开发（ARCHITECTURE.md / HANDOFF_CURRENT.md / models.py / schemas.py / routers/）

---

> **免责声明**：本报告基于公开网络信息、学术文献和 ROM-AI 系统代码的实地分析。部分关于特定事务所的内部流程细节可能因信息来源限制而存在偏差。报告中的工作量估算（~10h/P0）基于"已有底座、纯点亮"的假设，实际执行时间可能因具体实现细节而调整。

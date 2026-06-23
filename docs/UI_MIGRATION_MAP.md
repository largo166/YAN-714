# UI_MIGRATION_MAP — 旧 ROM-AI UI → 新 React 工程 迁移映射

> 旧源(只读):`C:\ROM-AI开发V3-chatgtp\backend\ui\index.html`
> 新工程:`C:\ROM-AI开发V3-chatgtp-new\frontend`
> 状态图例:✅已迁 · 🟡部分(视觉迁/数据待接) · ⬜未迁(后续) · 🔌待后端

| 旧 UI 内容 | 旧位置(行) | 新 React 目标位置 | 保留要求 | 当前状态 |
| --- | --- | --- | --- | --- |
| 全套设计系统 CSS（颜色/字体/卡片/按钮…） | 7–605 | `src/styles/legacy-ui.css` | 原样，勿改视觉 | ✅ 已原样抽出 |
| 顶栏 brand(ROM-AI SVG) + 五板块 nav | 618–635 | `components/layout/TopBar.tsx` | 文案/样式/激活态 | P1 |
| 页面壳 `.page.on` 切换 | 38–40,1502 | `App.tsx` 路由 + `pages/*` | fade、默认项目中心 | P1 |
| 项目中心(下拉/进度/KPI/文件/研判/里程碑/会议) | 640–766 | `pages/ProjectCenterPage.tsx` | 原 DOM/class/文案 | P1 视觉 / 🔌 数据 |
| 数据基地(检索/数据源/健康/文件树/资产/成果池) | 769–843 | `pages/KnowledgePage.tsx` | 原结构/文案 | P1 视觉 / 🔌 数据 |
| 共创营地(composer/引擎模式/A2三卡/技能卡/成果) | 846–933 | `pages/AgentPage.tsx` | 原结构/文案 | P1 视觉 / ⬜ 交互 |
| 协作平台(团队成员/智能助手卡) | 936–993 | `pages/HubPage.tsx` | 原卡片样式 | P1 视觉 / 🟡 静态 |
| 管理驾驶舱(通知/KPI/工作量/飞书/评论) | 996–1067 | `pages/BossPage.tsx` | 默认隐藏，原结构 | 🟡 P1 视觉 / 🔌 |
| 右侧设置抽屉（9 组） | 2573–2706 | `components/layout/SettingsDrawer.tsx` | 不可简化，9 组全留 | P2 |
| 状态角标 statpill / navdot | 569–595 | `components/ui/StatPill.tsx` | 4 态配色 | P1 |
| 各 modal（资产/会议/技能成果/图片预览） | 1071–1107 | `components/modals/*`（后续） | 原样式 | ⬜ 后续 |
| 后端不可达 `#srv-err` | 608–614 | `components/ServerError.tsx` | 文案中性化(去 exe) | 🟡 P3 |
| API 调用层（30+ 接口） | 1109–2572 | `src/lib/api.ts` | 统一封装 | 🔌 按新后端逐步 |
| 写死 PROJECTS/成员/飞书 演示数据 | 1132+,942+ | 后端 API 或真实空状态 | 不冒充真实 | 🟡 改造中 |

## 新后端已就绪、可直接接的接口
- `GET /api/projects`、`POST /api/projects`、`GET/PUT/DELETE /api/projects/{id}`（项目中心列表/新建/详情）
- `GET/PUT /api/settings`（设置抽屉「AI 引擎与密钥」一组的真实读写：base_url/model/key 已配标记/theme）
- `GET /health`（顶栏「本地运行」状态 + 后端不可达检测）

## 旧有但新后端尚无的接口（前端显示「待接入/未配置」，不编造数据）
- 知识库全系列 `/api/knowledge/*`、文件上传解析 `/api/projects/{id}/upload|parse|analyze`、A2 图片槽位、成果发送渠道、管理员登录、积分 `/api/credits`、boss dashboard、status-map。
- 处理:UI 完整保留，数据区显示空状态/「待接入后端」，对应 nav 用 `navdot.demo` 标记。

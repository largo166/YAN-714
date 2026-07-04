# ROM-AI 设计系统(DESIGN.md)

> 视觉权威文件。所有 UI 改动以本文为准;与代码不一致时,以本文口径修代码。
> 风格定位:**暗色霓虹驾驶舱**(克制、锋利、专业)——不是消费级柔玻璃,不是娱乐化霓虹。

## 1. 字体(唯一无衬线栈,全站统一)

```css
--font-sans: 'Space Grotesk','Noto Sans SC','PingFang SC','Microsoft YaHei',ui-sans-serif,system-ui,sans-serif;
--font-mono: 'Space Mono',ui-monospace,Consolas,monospace;
```

- 拉丁/数字 = Space Grotesk;中文 = Noto Sans SC(离线回退微软雅黑)。
- **禁止**在暗色界面混入宋体/衬线(历史病根:body 中文回退曾是 Noto Serif SC,致顶栏/抽屉宋体、页面雅黑的混乱;已在 `body.darkui` 收口)。
- 字体只在 `body.darkui` 声明一次;**页面/组件不得再内联 fontFamily**(mono 场景用 `.mono`/`code`)。
- 表单控件(button/input/textarea/select)已全局强制 `font-family: inherit`。
- 数字一律 `font-variant-numeric: tabular-nums`(KPI/计数/仪表)。

## 2. 字号与字重(类型标尺)

| 层级 | 规格 | 用途 |
|---|---|---|
| H1 页标题 | 32px / 600 / -0.025em | 每页一个;可配渐变文字(展示级纪律来自 FluidMatrix 规格) |
| H2 区块标题 | 16–17px / 700 | GroupLabel / 卡片标题(白 #fff) |
| 正文 | 13–13.5px / 400 | 行高 1.5–1.7 |
| 辅助 | 11–12.5px / 400 | mut 色 |
| KPI 大数字 | 27–36px / 700 / -0.03em / tabular | ckcard 内 |
| HERO KPI(gshell 签名带内) | 40–44px / 700 / -0.035em / tabular | 每页至多一条(驾驶舱 KPI 带,2026-07) |
| 按钮 | 12.5–13.5px / 600–700 / +0.01em | 主按钮 700,幽灵 600 |

字重只用 **400 / 600 / 700** 三档;禁止 500 以下的细体撑标题。

**按钮标尺 v2(2026-07-04,回应"按钮过大/白字挤")**:
- 主按钮(渐变填充,每面板≤1 个,只给真正的主动作):高 36px(padding 9px 15px)/ 13px / 700 /
  **letterSpacing .02em(渐变底白字必须加字距)**/ 圆角 10。`.btn` 全局类已按此收口,内联主按钮照此写。
- 次动作/幽灵:`.anbtn` 或 transparent+1px line 边框,12–12.5px,禁止再用渐变填充。
- 列表行内动作(每行都出现的):文字链 `.act` 或小号 anbtn,**禁止填充按钮**(一屏几十个色块=噪音)。
- 危险动作:幽灵红(红边红字),非填充红。
- 按钮文案 ≤6 字,上下文已说明的词不重复(卡头已写「腾讯会议」→ 按钮只写「一键创建」)。

## 3. 色板(与 BossPage/CampPage 等页内 `C` 常量一致,勿另起)

```
紫 #7c5cff(主) 蓝 #42a5ff(主渐变尾) 金 #d7a86e 青 #36e6d4 红 #ff5e66 琥珀 #fdab3d 绿 #49d18d
ink #f4f1ea  ink2 #d8d4cc  mut #8f96a5  mut2 #5f6674
line rgba(255,255,255,.08)   glass linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))
底 #030406→#07080c 渐变 + 三处霓虹径向光 + 48px HUD 网格(顶部渐隐)
```

- **主渐变唯一**:`linear-gradient(135deg,#7c5cff,#42a5ff)`(主按钮/选中态/进度)。
- 语义色:红=风险/危险,琥珀=待办/警示,青=纪要/检索命中,金=下一节点/仓库/管理员,绿=健康/在线。
- 装饰性配色向紫蓝收敛;**一屏内热色(红/琥珀/金)只做强调,不并排铺满**。
- **样式基座(P0 通电,2026-07-05)**:Tailwind + shadcn 已接电——变量桥在 `src/styles/tailwind.css`,
  把本节 token 映射成 shadcn HSL 语义变量(`--primary`=紫 7c5cff/`--card`=panel/`--border`=line 等,
  浅色回退=legacy `:root` 陶土橙系);**preflight 保持关闭**直到 legacy-ui.css 清退(P3),
  darkMode 由 `.darkui` 驱动;新组件一律走 Tailwind+shadcn(`src/components/ui/`),颜色只准引语义变量,
  禁止私设色值;`--radius: 10px` 对齐按钮标尺 v2。

## 4. 卡片与圆角

- 驾驶舱卡 `.ckcard`(全局类,legacy-ui.css):玻璃底 + 1px line 边 + **顶部内侧 1px 高光**(`inset 0 1px 0 rgba(255,255,255,.07)`,Liquid-Glass 手法)+ 顶边 2px 光条(`--ac`)+ 右上发光角(`--gl`)+ hover 抬升。
- 圆角:卡 18–22px / 按钮 10–14px / chip·pill 6–8px 或 99px 胶囊 / 弹层 20px。
- 内边距:卡 16–20px;区块间距 12–18px;分组间 24px。

## 5. 弹层(毛玻璃只用在浮层,不铺全页)

- 遮罩:`rgba(0,0,0,.5)` + `backdrop-filter: blur(10px) saturate(120%)`。
- 设置抽屉:`rgba(10,12,18,.82)` + `blur(26px)` 厚玻璃。
- 性能红线:backdrop-filter 仅限弹层/抽屉,页面常驻元素禁用。

## 6. 图标

- 统一 **lucide 线性图标**(`lucide-react`,strokeWidth 1.8–2,尺寸 11–17px,继承文字色)。
- 22 个技能图标走 `lib/icons.tsx` 的 `SkillGlyph` 映射(后端 icon 字段仅作 fallback)。
- **禁止彩色 emoji**;单色字形(✦ ▸ ▾ ✕ ⟳ ←)可作装饰。

## 6.5 板块动态背景(BoardBackdrop,按小样确认 2026-07)

- 共享组件 `lib/BoardBackdrop.tsx`(Canvas2D,DPR≤2,指针轻视差,reduced-motion 全关)。
- **同一紫蓝色调、只剩两种在用形态(2026-07-04 统一)**:工作台(项目中心/共创营地)=dots 点阵波场 /
  汇总台(数据基地/协作平台/管理驾驶舱)=aurora 静场极光(3 团固定模糊光斑,仅透明度呼吸,零位移)。
- **晕动症红线(2026-07 用户反馈,不可回退)**:禁止连续定向运动——下落光丝(streams)、
  滚动心电(pulse)、扫描线(radar)、游动粒子(sparks)、轨道运转(orbits)、连续平移走马灯(.ticktrack)
  全部弃用保留,不得再挂到页面。允许:静止场 / 缓慢透明度呼吸 / 极轻指针视差 / 用户触发的一次性过渡。
- **只罩各页 HERO 区**(父容器 relative,内容自抬 zIndex:1),工作列表区禁用;低透明度(≤0.16α)。
- **渐变描边壳 `.gshell`**(FluidMatrix 招牌技法):外壳 1px 上亮下消渐变细线,内面
  `rgba(7,8,12,.72)` 半透明深底(**不加 backdrop-filter**,常驻禁模糊);用于各页 HERO 签名卡,
  每页最多一处,与 ckcard 并存不混用。五页签名卡:项目中心=脉搏卡 / 数据基地=库存脉搏 /
  营地=composer HERO / 协作=甲方画像库 / 驾驶舱=KPI 签名带(2026-07)。
- **首屏公式(2026-07 改版)**:每屏一个主角;文件名长列表是首屏禁忌(全量列表进抽屉/降权区,
  首屏只留 类型统计 + 最近 N≤5);工作面板默认收起,点入口 tile 单开。
- **原文碎片禁渲染(2026-07-05 用户裁定)**:frontmatter/PDF 抽取乱文等检索原文片段一律不直接
  渲染成正文——"看起来很努力但对真实工作毫无价值"。出处=可追溯凭证不是阅读材料:徽章+标题
  chip 流,原文最多悬停 title 可查。唯一例外是检索结果页(数据基地全文检索/营地案例库命中),
  那里 snippet 就是答案本身。所有功能与版面围绕"做好设计"的价值观组织。

## 7. 动效(三层,克制:只在入场与状态变化时动)

1. 氛围:HUD 网格 36s 漂移一格 + 斜光扫 22s 缓摆(fixed 伪元素)。
2. 编排:切板块 ckcard 60ms 错峰渐入(只播一次);gshell 同款 ckin 入场(无 stagger)。
3. 数据:仪表充能(`--gp` 0→真实 pct,0.9s)+ 数字滚动(`useCountUp`,easeOutCubic,真实值驱动)。
- `prefers-reduced-motion: reduce` 时全部静止。hover 过渡 0.16s。

## 8. 文案口径

- 用户语言,不暴露工程口径(禁:留接缝/待接入/SQLite/P1-C/不伪造 等字样进 UI;技术注释放 tooltip)。
- 空态必须给下一步指引("跑一次技能,这里就会开始统计"),不是干巴巴"暂无 XX"。
- 未接入能力统一收进「即将接入」,不摆 disabled 灰控件。
- 数据诚实:没有真实数据显 `—` 或空态,**绝不伪造数字**;估算值必须标"估算"。

## 9. 布局骨架(页面范式)

- 页 = H1 头部(标题+徽章+副标) → HERO 双卡(签名仪表/聚焦) → KPI 指标带 → 分组(GroupLabel 竖条+渐隐线) → 主/侧两栏(minmax(0,1fr) + 320~340px) → 降权区(默认折叠)。
- 空态/加载:骨架或深色提示条;禁止大面积空白。

## 10. Tailwind 迁移标尺(P2 内联样式收口,2026-07-05)

目标:**像素级等价转换**——只把静态内联 style 换成工具类,不改布局、不改结构、不"顺手优化"。

- **颜色必须走 token,禁止 className 里写 hex**:
  页内 C 常量 hex → 板块色板类:`C.purple→brand-purple` `C.blue→brand-blue` `C.gold→brand-gold`
  `C.cyan→brand-cyan` `C.red→brand-red` `C.amber→brand-amber` `C.green→brand-green`
  `C.ink→ink` `C.ink2→ink-2` `C.mut→mut` `C.mut2→mut-2` `C.line→line` `#fff→white`;
  `var(--xxx)` 系(主题反应式)→ shadcn 语义类:`var(--mut)→muted-foreground` `var(--panel)→card`
  `var(--panel2)→popover` `var(--ink)→foreground` `var(--line/line2)→border/input` `var(--terra)→primary`。
- **字号一律任意值 `text-[13px]`,禁用 text-xs/sm/base 等命名档**——命名档会同时改 line-height,
  破坏继承的 1.5,不等价。行高显式写的才加 `leading-[x]`。
- 间距/圆角:标准档恰好相等才用(`gap-2`=8px),否则任意值(`p-[10px]` `rounded-[18px]`);
  `--radius`=10px ⇒ `rounded-lg`=按钮 10px 档。字重 500/600/700 → `font-medium/semibold/bold`。
- **必须保留内联的**:动态表达式(状态/计算宽度/animation-delay 循环)、grid 模板等超长一次性值可留。
  复杂渐变/glow 可用任意值(`shadow-[0_0_22px_rgba(124,92,255,.35)]`,空格换下划线),别硬转致损。
- legacy 类(.card/.anbtn/.statpill/.gshell/.ckcard…)原样保留不动;共享 style 常量对象 → 共享 className 串。
- 每文件收口后:剩余 `style={{` 只允许动态值;C 常量整体无引用才删,部分引用不折腾。
- 验收:tsc/eslint 零错误 + 迁移前后截图/关键元素计算样式比对 + 控制台零新错。

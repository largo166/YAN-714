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
| 按钮 | 12.5–13.5px / 600–700 / +0.01em | 主按钮 700,幽灵 600 |

字重只用 **400 / 600 / 700** 三档;禁止 500 以下的细体撑标题。

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
- **同一紫蓝色调、五种形态**:项目中心=dots 点阵波场 / 数据基地=streams 数据流 /
  共创营地=sparks 思维粒子 / 协作平台=orbits 轨道连线 / 管理驾驶舱=radar 雷达脉冲。
- **只罩各页 HERO 区**(父容器 relative,内容自抬 zIndex:1),工作列表区禁用;低透明度(≤0.16α)。
- **渐变描边壳 `.gshell`**(FluidMatrix 招牌技法):外壳 1px 上亮下消渐变细线,内面
  `rgba(7,8,12,.72)` 半透明深底(**不加 backdrop-filter**,常驻禁模糊);用于各页 HERO 签名卡,
  每页最多一处,与 ckcard 并存不混用。

## 7. 动效(三层,克制:只在入场与状态变化时动)

1. 氛围:HUD 网格 36s 漂移一格 + 斜光扫 22s 缓摆(fixed 伪元素)。
2. 编排:切板块 ckcard 60ms 错峰渐入(只播一次)。
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

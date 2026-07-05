/* 驾驶舱 AI 使用 mock(甜甜圈/图例/趋势;合计 39 与母版口径一致) */

export const USAGE_TOTAL = 39

export const USAGE_LEGEND = [
  { sw: '#7fb3cf', t: '评审', v: 13 },
  { sw: '#4f7f9e', t: '纪要', v: 7 },
  { sw: '#a8cfe0', t: '任务', v: 7 },
  { sw: '#5f93ad', t: 'PPT', v: 6 },
  { sw: '#d7e5ec', t: '生图', v: 6 },
] as const

/** conic-gradient 分段(与母版一致) */
export const USAGE_CONIC =
  'conic-gradient(#7fb3cf 0% 33%,#4f7f9e 33% 51%,#a8cfe0 51% 69%,#5f93ad 69% 84%,#d7e5ec 84% 100%)'

/** 近 14 日调用(合计 39) */
export const USAGE_TREND = [1, 2, 0, 3, 2, 4, 1, 2, 5, 3, 4, 2, 6, 4] as const

/** 成员工作量:分段=项目(宽度%,色=海系),右标签 */
export const WORKLOAD = [
  {
    name: '杨工',
    segs: [{ w: 50, c: '#7fb3cf' }, { w: 28, c: '#4f7f9e' }],
    tag: '偏高', tagColor: 'var(--sk-warn)',
    title: '杨工 · 3 任务:星河国际 ×2(强排比选 / 概念深化)· 石家庄长安天曜 ×1(立面研究)',
  },
  {
    name: '李工',
    segs: [{ w: 24, c: '#a8cfe0' }, { w: 18, c: '#7fb3cf' }],
    tag: '较轻', tagColor: 'var(--sk-ok)',
    title: '李工 · 2 任务:哈尔滨中艺 ×1(报建图)· 星河国际 ×1(日照分析)',
  },
  {
    name: '王工',
    segs: [{ w: 44, c: '#4f7f9e' }, { w: 26, c: '#7fb3cf' }, { w: 14, c: '#a8cfe0' }],
    tag: '超载', tagColor: 'var(--sk-risk)',
    title: '王工 · 4 任务:石家庄长安天曜 ×2(总图 / 汇报文本)· 星河国际 ×1(案例研究)· 哈尔滨中艺 ×1(复盘)',
  },
  {
    name: 'AI 助手',
    segs: [{ w: 34, c: '#7fb3cf' }, { w: 24, c: '#d7e5ec' }],
    tag: '在岗', tagColor: 'var(--sk-primary)',
    title: 'AI 助手 · 在岗:星河国际(找图雷达 ×1)· 杭州西站新城单元(材料归纳 ×1)',
  },
] as const

/** 驾驶舱头部 KPI */
export const COCKPIT_KPIS = [
  { v: '39', k: 'AI 成果 · 累计', tone: 'pri' },
  { v: '2/4', k: '成员负荷偏高', tone: '' },
  { v: '4', k: '高风险项', tone: 'risk' },
  { v: '8', k: '进行中项目', tone: '' },
] as const

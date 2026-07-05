/* 项目 mock(母版 PROJECTS 等价;prog 拆成数值+单位便于 React 渲染) */

export interface Project {
  name: string
  st: string
  run: string
  prog: string
  progUnit?: string
  files: string
  focus: string
}

export const PROJECTS_SEED: Project[] = [
  { name: '星河国际项目', st: '进行中 · 62%', run: '进行中', prog: '62', progUnit: '%', files: '291', focus: '2' },
  { name: '哈尔滨中艺项目', st: '进行中 · 100%', run: '进行中', prog: '100', progUnit: '%', files: '412', focus: '0' },
  { name: '石家庄长安天曜', st: '方案深化', run: '方案深化', prog: '48', progUnit: '%', files: '203', focus: '1' },
  { name: '杭州西站新城单元', st: '前期', run: '前期', prog: '12', progUnit: '%', files: '57', focus: '3' },
]

/** 16 节点阶段带(b0) */
export const STAGE_NODES = [
  { t: '任务书', s: 'done' }, { t: '条件梳理', s: 'done' }, { t: '场地研究', s: 'done' },
  { t: '使用者功能', s: 'done' }, { t: '案例研究', s: 'done' }, { t: '核心问题', s: 'done' },
  { t: '概念生成', s: 'cur' }, { t: '空间策略', s: '' }, { t: '体量推演', s: '' },
  { t: '动线组织', s: '' }, { t: '平剖立', s: '' }, { t: '方案比选', s: '' },
  { t: '图面表达', s: '' }, { t: '汇报叙事', s: '' }, { t: '评图反馈', s: '' }, { t: '复盘入库', s: '' },
] as const

/** 会议记录浮层(b0,原型示意数据) */
export const MEETING_MINUTES = [
  { dot: 'ok', txt: '06-24 例会 · 纪要已确认 · 3 项待办入看板', who: '已回流' },
  { dot: 'ok', txt: '06-18 概念定向会 · 「城市客厅」定为主叙事', who: '已归档' },
  { dot: 'ok', txt: '06-11 甲方对接 · 容积率 2.0 口径确认', who: '已归档' },
  { dot: 'warn', txt: '06-05 启动会 · 红线图电子版仍缺', who: '跟进中' },
] as const

/** 里程碑(b0) */
export const MILESTONES = [
  { dot: 'risk', txt: '今日下班前,向业主方经办人索要电子版 CAD 红线图与控规图则', who: '今日' },
  { dot: 'warn', txt: '按 2.0 容积率启动首轮总图强排比选,周五例会前出两版', who: '周五前' },
] as const

/** 分析摘要风险行(b0) */
export const ANALYSIS_RISKS = [
  '资料缺口:材料均为图片,未做 OCR,无法取文本',
  '关键约束:无技术参数(用地 / 容积率 / 限高)',
] as const

/** 数据基地类型统计(b1) */
export const DATA_TYPES = [
  { n: '413', t: '图纸' }, { n: '162', t: '其他' }, { n: '28', t: '方案文本' },
  { n: '23', t: '会议纪要' }, { n: '9', t: '案例' }, { n: '5', t: '任务书' },
] as const

/** 最近入库(b1 浮层) */
export const RECENT_INTAKE = [
  { pill: '图纸', txt: '2#3#6#7#报建图0701.pdf', who: '07-02' },
  { pill: '方案文本', txt: '杭州西站新城单元 YH080901-13 地块项目.pdf', who: '07-02' },
  { pill: '任务书', txt: '设计要求.txt', who: '06-29' },
  { pill: '图纸', txt: '星河国际 · 场地现状测绘.dwg.pdf', who: '06-28' },
  { pill: '案例', txt: '滨水综合体案例辑 · 12 项.pdf', who: '06-27' },
] as const

/** 协作平台(b3) */
export const TEAM_MEMBERS = [
  { g: '杨', name: '杨工', role: '主创建筑师 · 强排比选 / 概念深化', pill: 'warn', pillTxt: '负荷适中' },
  { g: '李', name: '李工', role: '建筑师 · 报建图 / 日照分析', pill: 'ok', pillTxt: '较轻' },
] as const

export const AI_STAFF = [
  { g: '找', name: '找图小雷达', role: '按项目关键词收集意向图与类比线索', on: true },
  { g: '材', name: '材料小帮手', role: '归纳项目资料 · 任务书 · 会议材料', on: true },
  { g: '审', name: '审图老法师 · 翻模小王子', role: '即将上岗', on: false },
] as const

export const CLIENT_PROFILES = ['保利(2)', '华润(1)', '城投(1)'] as const

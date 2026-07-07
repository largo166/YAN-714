/* 海天 OS 常量(与视觉母版 prototypes/romai-seasky-os-v2.html 同源) */

export type Phase = 'film' | 'gate' | 'boards' | 'app'
export type BoardIndex = 0 | 1 | 2 | 3 | 4

export const BOARD_NAMES = ['项目中心', '数据基地', '共创营地', '协作平台', '管理驾驶舱'] as const

/** 底部状态栏文案。
    铁律(2026-07-07 hotfix1):不得出现编造数字。
    - b0 项目中心:AppShell 用真实项目状态动态覆盖(此处值不显示)。
    - 其余板:AppShell 层拿不到各板 live hook 的真实计数(在各 board 内),
      故一律用中性标签,不写死"640/22/4"这类假统计。真实计数展示在各板内(如数据基地大字)。
      日后若要状态栏显真数,需把对应 live 计数上提到 AppShell,另立项。 */
export const BOARD_STATUS = [
  '项目中心 · 负责人工作台',
  '数据基地 · 记忆底座',
  '共创营地 · 思考中控',
  '协作平台 · 团队协同',
  '管理驾驶舱 · 只读大盘',
]

/** 板块选择页(boards)卡片 */
export const BOARD_PILLARS = [
  { no: '01', zh: '项目中心', role: '负责人工作台\n判断从这里开始' },
  { no: '02', zh: '数据基地', role: '记忆底座\n材料成为可引用的记忆' },
  { no: '03', zh: '共创营地', role: '思考中控\n与设计委员会推演' },
  { no: '04', zh: '协作平台', role: '团队协同\n谁在做什么一眼可见' },
  { no: '05', zh: '管理驾驶舱', role: '只读大盘\n跨项目聚合不打扰执行' },
] as const

/** localStorage 键(与原型完全同名——用户既有的记忆无缝延续) */
export const LS_KEYS = {
  skipIntro: 'romai_skip_intro',
  seenIntro: 'romai_seen_intro',
  projects: 'romai_projects_v1',
  board: 'romai_seasky_board',
  campTab: 'romai_seasky_camp_tab',
  model: 'romai_seasky_model',
} as const

/** 设计基准逻辑分辨率(流体舞台的缩放基准) */
export const STAGE_BASE = { w: 1280, h: 720 } as const

/** 海系四阶(项目分段色:日历/工作量共用) */
export const PROJ_COLORS = ['#7fb3cf', '#a8cfe0', '#4f7f9e', '#d7e5ec'] as const

export const MODELS = ['ROM Max · 深推理', 'ROM Pro · 均衡', 'ROM Lite · 快问快答'] as const

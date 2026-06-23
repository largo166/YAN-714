/** 五板块定义（对应旧 UI 顶栏 nav，文案/顺序保持一致）。 */
export type BoardKey = 'proj' | 'know' | 'agent' | 'hub' | 'boss'

export interface BoardDef {
  key: BoardKey
  label: string
  /** boss 板块默认隐藏，仅管理员可见 */
  adminOnly?: boolean
}

export const BOARDS: BoardDef[] = [
  { key: 'proj', label: '项目中心' },
  { key: 'know', label: '数据基地' },
  { key: 'agent', label: '共创营地' },
  { key: 'hub', label: '协作平台' },
  { key: 'boss', label: '管理驾驶舱', adminOnly: true },
]

/** 功能状态角标语义（对应旧 statpill / navdot）。 */
export type FeatureStatus = 'live' | 'prog' | 'demo' | 'fail'

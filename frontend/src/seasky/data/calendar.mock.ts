/* 项目日历 mock(2026-07;p=项目索引,色=海系四阶) */

export interface CalEvent {
  p: number
  t: string
}

/** 2026-07:1 日=周三;键=几号 */
export const CAL_EVENTS: Record<number, CalEvent[]> = {
  3: [{ p: 0, t: '例会 · 纪要确认' }],
  7: [{ p: 1, t: '节点 · 扩初提交' }],
  10: [{ p: 0, t: '甲方汇报' }, { p: 2, t: '强排比选评审' }],
  15: [{ p: 1, t: '交付 · 报建图' }],
  18: [{ p: 0, t: '评图 · 概念定向' }],
  22: [{ p: 2, t: '节点 · 概念定案' }],
  28: [{ p: 0, t: '交付 · 中期成果' }],
  31: [{ p: 3, t: '启动会' }],
}

export const CAL_TODAY = 5
export const CAL_LEAD_DIM = [29, 30] /* 月首补位(上月尾) */
export const CAL_TAIL_DIM = [1, 2] /* 月尾补位(下月头) */
export const CAL_DOW = ['一', '二', '三', '四', '五', '六', '日'] as const

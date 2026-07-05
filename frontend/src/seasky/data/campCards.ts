/* 营地快捷卡数据源(skillId 口径,与真实 runSkill 对齐)。
   独立于 skills.mock.ts 的旧 QC_*(那份是 agent 索引+reply 演示口径,已弃用)。
   纪律(2026-07-06):组件内不得定义与数据源同名的本地常量——本文件是快捷卡的唯一真源。 */

export interface QuickCardDef {
  i: string
  t: string
  s: string
  skillId: string
}

/* 对话共创四卡:紫黑版口径(复盘进度/概念激发/定义工作流/起草汇报),不擅改 */
export const CAMP_QC_ASK: readonly QuickCardDef[] = [
  { i: '◐', t: '复盘进度', s: '总结近期投标推进与卡点', skillId: 'review' },
  { i: '✦', t: '概念激发', s: '头脑风暴方案概念方向', skillId: 'concept' },
  { i: '⌗', t: '定义工作流', s: '搭建设计—出图—评审流程', skillId: 'flow' },
  { i: '✎', t: '起草汇报', s: '生成甲方汇报提纲与说辞', skillId: 'brief' },
] as const

/* 设计智能体四卡:真技能同 id(与紫黑 AGENTS 口径一致) */
export const CAMP_QC_AGENTS: readonly QuickCardDef[] = [
  { i: '领', t: '方案领航员', s: '从任务书引导到体量概念', skillId: 'concept' },
  { i: '标', t: '对标研究员', s: '同类型案例检索与条目化对比', skillId: 'compete' },
  { i: '文', t: '文本起草官', s: '投标文本 · 汇报叙事 · 一页纸', skillId: 'writer' },
  { i: '督', t: '节点督办官', s: '盯紧里程碑与逾期风险', skillId: 'judge' },
] as const

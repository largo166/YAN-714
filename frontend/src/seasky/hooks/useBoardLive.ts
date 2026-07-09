import { useKnowledgeLive, type KnowledgeLive } from './useKnowledgeLive'
import { useSkillsLive, type SkillsLive } from './useSkillsLive'
import { useHubLive, type HubLive } from './useHubLive'

/* ═══ 汇聚层:五板底部状态栏 + 各板共用的单一数据源(2026-07-07 hotfix1) ═══
   张文事故病根 = 同一数据两条路径各自缓存(状态栏假 640 / 板内真数)。此层从架构上消灭第二条路径:
   AppShell 在此一次性持有 knowledge/skills/hub 三份 live,状态栏与各 board 读同一份,永远一致。

   active 恒 true:冷启动停在项目中心时,状态栏 b1-b3 也已是真值(不是切板才加载)。
   代价 = 启动多 3 个轻 GET(stats/skills/members),换"状态栏永远真、永不与板内打架",值。

   ⚠️ 事件语义约定(禁"万能刷新事件"):
   每类数据变更配自己的事件名(知识库=romai:knowledge-updated,已由 useKnowledgeLive 监听)。
   未来技能/成员如需事件刷新,各起 romai:skills-updated / romai:members-updated,
   由对应 hook 各自监听——严禁一个事件把所有 hook 都拉一遍(那是另一种数据源糊化)。
   当前:入库只改知识库,故只有 knowledge 监听 knowledge-updated;技能/成员随各自 CRUD 刷新。 */
export interface BoardLive {
  knowledge: KnowledgeLive
  skills: SkillsLive
  hub: HubLive
}

export function useBoardLive(enabled = true): BoardLive {
  const knowledge = useKnowledgeLive(enabled)
  const skills = useSkillsLive(enabled)
  const hub = useHubLive(enabled)
  return { knowledge, skills, hub }
}

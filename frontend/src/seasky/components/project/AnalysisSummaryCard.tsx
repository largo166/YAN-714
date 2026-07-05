import type { ProjectRisk } from '@/types/schemas'

import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Dot } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* b0 · 分析摘要卡(接真):lead=最新研判首行,风险=真 risks 端点;空态如实引导 */

export function AnalysisSummaryCard({ lead, risks }: { lead: string | null; risks: ProjectRisk[] }) {
  return (
    <GlassCard slim data-in>
      <CardHead slim title="分析摘要" en="Judgment" right={<HeadNote>16 域解读 → 智能研判</HeadNote>} />
      {lead ? (
        <div className="font-skcjk text-[11.5px] font-light leading-[1.75] tracking-[0.04em] text-[#c9ccd0]">{lead}</div>
      ) : (
        <div className="font-skcjk text-[11.5px] font-light leading-[1.75] tracking-[0.04em] text-sk-muted">
          本项目暂无 AI 研判。到共创营地跑一次「智能研判」后,摘要会出现在这里。
        </div>
      )}
      {risks.slice(0, 2).map((r) => (
        <MRow key={r.text} compact lead={<Dot tone={r.level === 'high' ? 'risk' : 'warn'} />} text={r.text} />
      ))}
    </GlassCard>
  )
}

import { ANALYSIS_RISKS } from '../../data/projects.mock'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Dot } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/** 分析摘要卡(P0-5:16域解读→智能研判,风险并入) */
export function AnalysisSummaryCard() {
  return (
    <GlassCard slim data-in>
      <CardHead slim title="分析摘要" en="Judgment" right={<HeadNote>16 域解读 → 智能研判</HeadNote>} />
      <div className="font-skcjk text-[11.5px] font-light leading-[1.75] tracking-[0.04em] text-[#c9ccd0]">
        滨水地块 · 容积率 2.0 · 甲方求「城市客厅」— 解读完成 100%,2 项高风险待化解
      </div>
      {ANALYSIS_RISKS.map((r) => (
        <MRow key={r} compact lead={<Dot tone="risk" />} text={r} />
      ))}
    </GlassCard>
  )
}

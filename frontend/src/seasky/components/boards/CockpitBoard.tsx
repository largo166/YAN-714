import { COCKPIT_KPIS } from '../../data/usage.mock'
import { cn } from '../../lib/cn'
import { ProjectCalendar } from '../cockpit/ProjectCalendar'
import { UsageDonut } from '../cockpit/UsageDonut'
import { WorkloadPanel } from '../cockpit/WorkloadPanel'
import { BroadcastPanel } from '../system/BroadcastPanel'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Label } from '../common/PillButton'

/* ═══ b4 管理驾驶舱:数据网格——AI 使用+工作量双数据区,项目日历为主角(b4 波接真+门禁) ═══ */

export function CockpitBoard({ curIdx, projectNames }: { curIdx: number; projectNames: string[] }) {
  return (
    <div className="absolute inset-0 flex flex-col gap-3.5 p-5 px-11">
      {/* 细头带:eyebrow + 行内 KPI */}
      <div className="flex flex-none items-baseline gap-[26px]" data-in>
        <Label>Cockpit{'　'}只读大盘 · 跨项目聚合 不打扰执行</Label>
        <div className="ml-auto flex gap-[26px]">
          {COCKPIT_KPIS.map((k) => (
            <span key={k.k} className="flex items-baseline gap-[9px] font-skcjk text-[11px] font-light tracking-[0.1em] text-sk-muted2">
              <b
                className={cn(
                  'font-sans text-[23px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]',
                  k.tone === 'pri' && 'text-sk-primary',
                  k.tone === 'risk' && 'text-sk-risk',
                )}
              >
                {k.v}
              </b>
              {k.k}
            </span>
          ))}
        </div>
      </div>

      {/* 数据网格:a b | c(日历主角,跨两行) / d d | c */}
      <div
        className="grid min-h-0 flex-1 gap-3.5"
        style={{
          gridTemplateColumns: '1fr 1fr 1.35fr',
          gridTemplateRows: '1.22fr 0.78fr',
          gridTemplateAreas: "'a b c' 'd d c'",
        }}
        data-in
      >
        <GlassCard style={{ gridArea: 'a' }}>
          <CardHead title="AI 使用情况" en="AI Usage" right={<HeadNote>调用量 · 分布 · 趋势</HeadNote>} />
          <UsageDonut />
        </GlassCard>
        <GlassCard style={{ gridArea: 'b' }}>
          <CardHead title="成员工作量" en="Workload" right={<HeadNote>分段=项目 · 悬停明细</HeadNote>} />
          <WorkloadPanel />
        </GlassCard>
        <GlassCard style={{ gridArea: 'c' }}>
          <CardHead title="项目日历 · 2026-07" en="Calendar" />
          <ProjectCalendar curIdx={curIdx} names={projectNames} />
        </GlassCard>
        <GlassCard style={{ gridArea: 'd' }}>
          <CardHead title="发全员通知" en="Broadcast" />
          <BroadcastPanel />
        </GlassCard>
      </div>
    </div>
  )
}

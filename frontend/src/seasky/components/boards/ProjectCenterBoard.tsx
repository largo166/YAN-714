import { boardImages } from '../../data/boardImages'
import { MILESTONES, STAGE_NODES } from '../../data/projects.mock'
import type { useProjectState } from '../../hooks/useProjectState'
import { cn } from '../../lib/cn'
import { AnalysisSummaryCard } from '../project/AnalysisSummaryCard'
import { MeetingChainCard } from '../project/MeetingTile'
import { ProjectSwitcher } from '../project/ProjectSwitcher'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Dot, Label, Pill } from '../common/PillButton'
import { MRow, StatBlock } from '../common/StatBlock'

/* ═══ b0 项目中心:左图右文(Garch·OS 构图)——图为主角,判断在右列 ═══ */

export function ProjectCenterBoard({ proj }: { proj: ReturnType<typeof useProjectState> }) {
  const img = boardImages.project
  const P = proj.current

  return (
    <div className="absolute inset-0 flex gap-[26px] p-5 px-11 pb-[18px]">
      {/* 左:效果图主角 */}
      {img && (
        <figure className="relative m-0 min-w-0 flex-[1.08] overflow-hidden rounded-skpanel border-[0.5px] border-sk-border" data-in>
          <img src={img.src} alt="项目效果图" className="absolute inset-0 h-full w-full object-cover [filter:saturate(.92)]" />
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, rgba(10,12,14,.08) 40%, rgba(10,12,14,.72))' }}
          />
          <Pill tone="pri" className="absolute right-4 top-4 z-[2] bg-[rgba(10,12,14,.55)] backdrop-blur-[8px]">
            进行中 · 概念生成
          </Pill>
          <figcaption className="absolute bottom-[18px] left-[22px] z-[2] flex flex-col gap-[7px]">
            <Label>Hero Image</Label>
            <span className="font-skcjk text-[12.5px] font-light tracking-[0.1em] text-[#dfe3e6]">
              {img.caption ?? '效果图占位 · 可在图片配置中替换'}
            </span>
          </figcaption>
        </figure>
      )}

      {/* 右:判断列 */}
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <Label data-in>Project Center{'　'}负责人工作台</Label>
        <div className="font-skcjk text-[27px] font-light leading-[1.4] tracking-[0.14em] [text-indent:0.14em] text-sk-fg" data-in>
          <ProjectSwitcher proj={proj} />
        </div>
        <div className="flex gap-[30px] py-0.5" data-in>
          <StatBlock compact alignLeft tone="pri" value={P.prog} unit={P.progUnit} label="阶段进度" />
          <StatBlock compact alignLeft value={P.files} label="文件" />
          <StatBlock compact alignLeft tone="risk" value={P.focus} label="本周聚焦" />
        </div>

        {/* 阶段拆解:16 节点单行横滚 */}
        <GlassCard slim data-in>
          <CardHead slim title="阶段拆解" en="16 Nodes" right={<HeadNote>当前 · 概念生成</HeadNote>} />
          <div className="sk-stagebar flex flex-nowrap items-center gap-[5px] pb-0.5">
            {STAGE_NODES.map((n) => (
              <span
                key={n.t}
                className={cn(
                  'flex-none rounded-full border-[0.5px] border-sk-hairsoft px-[9px] py-[3px] font-skcjk text-[10px] font-light tracking-[0.08em] text-sk-muted2 transition-all duration-200',
                  n.s === 'done' && 'border-[rgba(127,179,207,.35)] text-sk-primary',
                  n.s === 'cur' && 'border-[rgba(127,179,207,.6)] text-sk-fg shadow-[0_0_10px_rgba(127,179,207,.2)]',
                )}
              >
                {n.t}
              </span>
            ))}
          </div>
        </GlassCard>

        <MeetingChainCard />
        <AnalysisSummaryCard />

        <GlassCard slim data-in>
          <CardHead slim title="下一步 · 里程碑" en="Milestones" />
          {MILESTONES.map((m) => (
            <MRow key={m.txt} compact lead={<Dot tone={m.dot as 'risk' | 'warn'} />} text={m.txt} who={m.who} />
          ))}
        </GlassCard>
      </div>
    </div>
  )
}

import { useState } from 'react'

import { boardImages } from '../../data/boardImages'
import { useProjectLive } from '../../hooks/useProjectLive'
import { STAGE_LABELS, STAGE_ORDER, type ProjectBridge } from '../../services/projectBridge'
import { cn } from '../../lib/cn'
import { AnalysisSummaryCard } from '../project/AnalysisSummaryCard'
import { MeetingChainCard } from '../project/MeetingTile'
import { ProjectSwitcher } from '../project/ProjectSwitcher'
import { ImageAssetPool } from '../data/ImageAssetPool'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Dot, GhostButton, Label, Pill } from '../common/PillButton'
import { MRow, StatBlock } from '../common/StatBlock'

/* ═══ b0 项目中心:左图右文(构图冻结)——全卡接真:
   HERO 数字=progress/overview;阶段带=current_stage;会议链/研判/里程碑=真端点 ═══ */

export function ProjectCenterBoard({ proj, active }: { proj: ProjectBridge; active: boolean }) {
  const img = boardImages.project
  const [assetPoolOpen, setAssetPoolOpen] = useState(false) /* 图片资产池抽屉 */
  const live = useProjectLive(active, proj.cur?.id ?? null)

  const curStage = proj.cur?.current_stage || 'brief'
  const curStageIdx = Math.max(0, STAGE_ORDER.indexOf(curStage))
  const stageLabel = STAGE_LABELS[curStage] ?? curStage
  const urgentCount = live.milestones.filter((m) => m.urgent).length
  const focus = urgentCount > 0 ? urgentCount : live.overview?.todos ?? 0

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
            {proj.cur ? `${proj.cur.status || '进行中'} · ${stageLabel}` : '加载中'}
          </Pill>
          <figcaption className="absolute bottom-[18px] left-[22px] z-[2] flex flex-col gap-[7px]">
            <Label>Hero Image</Label>
            <span className="font-skcjk text-[12.5px] font-light tracking-[0.1em] text-[#dfe3e6]">
              {img.caption ?? '效果图占位 · 可在图片配置中替换'}
            </span>
          </figcaption>
        </figure>
      )}

      {/* 右:判断列(全真源) */}
      <div className="flex min-w-0 flex-1 flex-col gap-[9px]">
        <Label data-in>Project Center{'　'}负责人工作台</Label>
        <div className="font-skcjk text-[27px] font-light leading-[1.4] tracking-[0.14em] [text-indent:0.14em] text-sk-fg" data-in>
          <ProjectSwitcher proj={proj} />
        </div>
        {live.err && <div className="font-skcjk text-[12px] font-light text-sk-risk" data-in>{live.err}</div>}
        <div className="flex gap-[30px] py-0.5" data-in>
          <StatBlock
            compact alignLeft tone="pri"
            value={live.progress ? String(live.progress.pct) : live.loading ? '…' : '—'}
            unit={live.progress ? '%' : undefined}
            label="阶段进度"
          />
          <StatBlock compact alignLeft value={live.overview ? String(live.overview.files) : live.loading ? '…' : '—'} label="文件" />
          <StatBlock compact alignLeft tone="risk" value={live.loading ? '…' : String(focus)} label="本周聚焦" />
        </div>

        {/* 阶段拆解:16 节点,当前节点=项目 current_stage */}
        <GlassCard slim data-in>
          <CardHead
            slim
            title="阶段拆解"
            en="16 Nodes"
            right={
              <span className="flex items-center gap-2.5">
                <GhostButton
                  onClick={() => setAssetPoolOpen(true)}
                  title="查看本项目从 PPT/PDF/Word 抽出的所有图(效果图/总图/参考),可筛选、改分类、打开原文件"
                >
                  图片资产 ›
                </GhostButton>
                <HeadNote>当前 · {stageLabel}</HeadNote>
              </span>
            }
          />
          <div className="sk-stagebar flex flex-nowrap items-center gap-[5px] pb-0.5">
            {STAGE_ORDER.map((key, i) => (
              <span
                key={key}
                className={cn(
                  'flex-none rounded-full border-[0.5px] border-sk-hairsoft px-[9px] py-[3px] font-skcjk text-[10px] font-light tracking-[0.08em] text-sk-muted2 transition-all duration-200',
                  i < curStageIdx && 'border-[rgba(127,179,207,.35)] text-sk-primary',
                  i === curStageIdx && 'border-[rgba(127,179,207,.6)] text-sk-fg shadow-[0_0_10px_rgba(127,179,207,.2)]',
                )}
              >
                {STAGE_LABELS[key]}
              </span>
            ))}
          </div>
        </GlassCard>

        <MeetingChainCard
          projectId={proj.cur?.id ?? null}
          meetings={live.overview?.meetings ?? 0}
          minutes={live.overview?.minutes ?? 0}
          todos={live.overview?.todos ?? 0}
        />
        <AnalysisSummaryCard lead={live.analysisLead} risks={live.risks} />
        <GlassCard slim data-in>
          <CardHead slim title="下一步 · 里程碑" en="Milestones" />
          {live.loading && <div className="font-skcjk text-[11.5px] font-light text-sk-muted2">加载中…</div>}
          {!live.loading && live.milestones.length === 0 && (
            <div className="font-skcjk text-[11.5px] font-light text-sk-muted">
              暂无里程碑。确认一份会议纪要后,下一步会出现在这里。
            </div>
          )}
          {live.milestones.slice(0, 2).map((m) => (
            <MRow key={m.title} compact lead={<Dot tone={m.urgent ? 'risk' : 'warn'} />} text={m.title} who={m.due} />
          ))}
        </GlassCard>
      </div>

      <ImageAssetPool
        open={assetPoolOpen}
        onClose={() => setAssetPoolOpen(false)}
        projectId={proj.cur?.id ?? null}
        projectName={proj.cur?.name}
      />
    </div>
  )
}

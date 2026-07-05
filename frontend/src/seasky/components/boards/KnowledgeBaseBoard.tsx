import { useState } from 'react'

import { boardImages } from '../../data/boardImages'
import { useKnowledgeLive } from '../../hooks/useKnowledgeLive'
import { DataSourceStrip } from '../data/DataSourceStrip'
import { CleanupOverlay } from '../data/CleanupOverlay'
import { KnowledgeSearch } from '../data/KnowledgeSearch'
import { Popover } from '../common/Modal'
import { GhostButton, Label, Pill } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* ═══ b1 数据基地:大字纪念碑(构图冻结)——巨号=真 stats.documents;
   类型带/最近入库/收件箱/检索全接真;清理入口与「最近入库」同级同规格,流程收进浮层 ═══ */

export function KnowledgeBaseBoard({ active }: { active: boolean }) {
  const live = useKnowledgeLive(active)
  const [recentOpen, setRecentOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const img = boardImages.data

  const big = live.stats ? String(live.stats.documents) : live.loading ? '…' : '—'
  const idxRate = live.stats && live.stats.documents > 0
    ? `${Math.min(100, Math.round((live.stats.indexed / live.stats.documents) * 100))}%`
    : '—'
  const cjk = live.stats ? live.stats.cjk_chunks.toLocaleString() : '—'

  return (
    <>
      <div className="absolute inset-0 flex flex-col justify-center gap-[26px] px-24 pb-[118px]">
        <Label data-in>Data Base{'　'}记忆底座 · 每一份材料都成为记忆</Label>

        {/* 主角:巨号受管文档数(真源) */}
        <div className="flex items-baseline gap-[38px]" data-in>
          <span className="font-sans text-[148px] font-medium leading-[0.92] tracking-[-0.02em] text-sk-fg [font-variant-numeric:tabular-nums]">
            {big}
          </span>
          <div className="flex gap-10 pb-2.5">
            {([
              [idxRate, '索引完成率'],
              [cjk, `索引块 · CJK(引擎 ${live.stats?.engine ?? '—'})`],
              [String(live.typeStats.length || '—'), '资料类型'],
            ] as const).map(([v, k]) => (
              <div key={k} className="flex flex-col gap-2 font-sans text-[22px] font-medium text-sk-primary">
                {v}
                <span className="font-skcjk text-[11px] font-light tracking-[0.14em] text-sk-muted2">{k}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 大检索行(真 FTS5,结果收敛浮层) */}
        <KnowledgeSearch />

        {/* 类型带 + 最近入库 + 一键清理(同级同规格) + 收件箱状态 */}
        <div className="relative flex flex-wrap items-center gap-2.5" data-in>
          <div className="flex flex-wrap gap-2.5">
            {live.loading && <span className="font-skcjk text-[12px] font-light text-sk-muted2">类型统计加载中…</span>}
            {live.err && <span className="font-skcjk text-[12px] font-light text-sk-risk">统计加载失败:{live.err}</span>}
            {live.typeStats.slice(0, 6).map(([t, n]) => (
              <div
                key={t}
                className="min-w-[86px] cursor-default rounded-[12px] border-[0.5px] border-sk-hairsoft px-4 py-2.5 transition-colors duration-200 hover:border-[rgba(127,179,207,.35)]"
              >
                <div className="font-sans text-[20px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">{n}</div>
                <div className="mt-[3px] font-skcjk text-[11px] font-light tracking-[0.1em] text-sk-muted2">{t}</div>
              </div>
            ))}
          </div>
          <span className="relative">
            <GhostButton onClick={(e) => { e.stopPropagation(); setRecentOpen((o) => !o) }}>最近入库 ›</GhostButton>
            <Popover
              open={recentOpen}
              onClose={() => setRecentOpen(false)}
              title="最近入库"
              note={`Recent ${live.recent.length}`}
              className="bottom-[calc(100%+10px)] left-0 min-w-[430px]"
            >
              {live.recent.length === 0 && <div className="py-1 font-skcjk text-[12px] font-light text-sk-muted">暂无入库记录。</div>}
              {live.recent.map((r) => (
                <MRow key={r.id} compact lead={<Pill>{r.type}</Pill>} text={r.title} who={r.created_at.slice(5, 10)} />
              ))}
            </Popover>
          </span>
          <GhostButton onClick={() => setCleanupOpen(true)}>一键清理 ›</GhostButton>
          {live.inbox && (
            <Pill tone={live.inbox.configured && live.inbox.accessible ? 'ok' : 'default'}>
              {live.inbox.configured
                ? live.inbox.accessible
                  ? `收件箱 · 运行中 · 待处理 ${live.inbox.pending}`
                  : '收件箱 · 路径不可访问'
                : '收件箱 · 未启用'}
            </Pill>
          )}
        </div>
      </div>
      {img && <DataSourceStrip />}
      <CleanupOverlay open={cleanupOpen} onClose={() => setCleanupOpen(false)} />
    </>
  )
}

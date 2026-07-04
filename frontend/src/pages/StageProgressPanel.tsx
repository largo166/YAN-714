import { useEffect, useState } from 'react'
import { CheckCircle2, Hourglass } from 'lucide-react'

import { api } from '@/lib/api'
import type { StageProgressOut } from '@/types/schemas'

/** 工作流状态机·下一步建议（阶段4）：据已确认认知算阶段进度,聚合「下一步建议」。
 *  只读——建议由用户在认知卡逐步触发,不自动跑流水线（不伪造进度）。 */
export default function StageProgressPanel({ projectId }: { projectId: number | null }) {
  const [sp, setSp] = useState<StageProgressOut | null>(null)

  useEffect(() => {
    if (projectId == null) {
      setSp(null)
      return
    }
    api.getStageProgress(projectId).then(setSp).catch(() => setSp(null))
  }, [projectId])

  if (projectId == null || !sp) return null

  const labelOf = (stage: string) => sp.nodes.find((n) => n.stage === stage)?.label ?? stage
  const ready = sp.suggestions.filter((s) => s.ready)
  const blocked = sp.suggestions.filter((s) => !s.ready)
  const curLabel = labelOf(sp.current_stage)

  return (
    <div className="card mt">
      <div className="ct" style={{ marginBottom: 8 }}>
        工作流·下一步建议{' '}
        <span className="statpill demo">
          认知阶段 {sp.done_count}/{sp.total_cognition_stages} · 当前：{curLabel}
        </span>
      </div>

      {/* 16 节点进度条:done=实心,认知未完成=空心,纯过程=点 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {sp.nodes.map((n) => (
          <span
            key={n.stage}
            title={`${n.label}${n.kind === 'cognition' ? (n.done ? '·已完成' : '·待完成') : '·过程节点'}`}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 10,
              background: n.done ? 'var(--terra)' : 'var(--panel2)',
              color: n.done ? '#fff' : n.kind === 'cognition' ? 'var(--ink)' : 'var(--mut)',
              border: n.stage === sp.current_stage ? '1px solid var(--terra)' : '1px solid transparent',
            }}
          >
            {n.label}
          </span>
        ))}
      </div>

      {ready.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>
            <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--ok)' }} />可推进（上游已就绪）：
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ready.map((s) => (
              <span key={s.stage} className="statpill live" style={{ fontSize: 11.5 }}>
                {s.label}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>
            到「项目结构化认知」对应模块点「AI 抽取」即可推进（逐步触发，不自动串跑）。
          </div>
        </div>
      )}

      {blocked.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>
            <Hourglass size={13} style={{ verticalAlign: -2, marginRight: 4 }} />待上游：
          </div>
          <div style={{ display: 'grid', gap: 3 }}>
            {blocked.map((s) => (
              <div key={s.stage} style={{ fontSize: 11.5, color: 'var(--mut)' }}>
                {s.label} — 需先完成：{s.blocked_by.map(labelOf).join('、')}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'

import { knowledgeService as ks } from '../../services'
import { FlowBtn, FlowCard, FlowCounts, FlowTonePill, type CardTone } from './flowKit'

/* b2 · 接入资料动作卡:选中文件→upload→index→extract 三连(全既有端点)。
   口径(已拍):仅接入当前作用项目;索引失败诚实计数+失败名。挂载即跑(上传非花钱非破坏)。 */

export interface OrganizePayload {
  files: File[]
  skipped: string[]
  projectId: number
  projectName: string
}

interface Outcome {
  name: string
  uploaded: boolean
  indexed: boolean
  error?: string
}

export function OrganizeFlowCard({ p, onGoKnow }: { p: OrganizePayload; onGoKnow: () => void }) {
  const [phase, setPhase] = useState<'running' | 'done'>('running')
  const [done, setDone] = useState(0)
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let alive = true
    ;(async () => {
      const acc: Outcome[] = []
      const ids: number[] = []
      for (const f of p.files) {
        const o: Outcome = { name: f.name, uploaded: false, indexed: false }
        try {
          const pf = await ks.upload(p.projectId, f)
          o.uploaded = true
          ids.push(pf.id)
          try {
            await ks.index(p.projectId, pf.id)
            o.indexed = true
          } catch (e) {
            o.error = `索引失败:${(e as Error).message}`
          }
        } catch (e) {
          o.error = `上传失败:${(e as Error).message}`
        }
        acc.push(o)
        if (!alive) return
        setOutcomes([...acc])
        setDone(acc.length)
      }
      void Promise.all(ids.map((id) => ks.extractAssets(p.projectId, id).catch(() => null)))
      if (alive) setPhase('done')
    })()
    return () => {
      alive = false
    }
  }, [p])

  const okUp = outcomes.filter((o) => o.uploaded).length
  const okIdx = outcomes.filter((o) => o.indexed).length
  const failed = outcomes.filter((o) => o.error)
  const tone: CardTone = phase === 'running' ? 'pending' : failed.length === p.files.length ? 'error' : 'ok'
  const pillText = phase === 'running' ? `整理中 ${done}/${p.files.length}` : failed.length === p.files.length ? '失败' : '完成'

  return (
    <FlowCard icon="⬒" title={`接入资料 → 「${p.projectName}」`} pill={<FlowTonePill tone={tone} text={pillText} />}>
      {phase === 'running' && (
        <div className="text-sk-warn">正在接入第 {Math.min(done + 1, p.files.length)}/{p.files.length} 个文件…原件不动,复制入库并建索引。</div>
      )}
      {phase === 'done' && (
        <div className="flex flex-col gap-2">
          <FlowCounts
            items={[
              ['接入', okUp, okUp > 0 ? 'var(--sk-ok)' : 'var(--sk-muted)'],
              ['建索引', okIdx, okIdx > 0 ? 'var(--sk-ok)' : 'var(--sk-muted)'],
              ['失败', failed.length, failed.length > 0 ? 'var(--sk-risk)' : 'var(--sk-muted)'],
              ['跳过', p.skipped.length, p.skipped.length > 0 ? 'var(--sk-warn)' : 'var(--sk-muted)'],
            ]}
          />
          {failed.length > 0 && (
            <div className="text-[11.5px] text-sk-risk">
              {failed.map((f) => (
                <div key={f.name}>· {f.name} — {f.error}</div>
              ))}
            </div>
          )}
          {p.skipped.length > 0 && <div className="text-[11px] text-sk-muted2">跳过(不支持):{p.skipped.join('、')}</div>}
          <div className="text-[11.5px] text-sk-muted">已成为该项目材料,技能/评图可直接引用。</div>
          <div>
            <FlowBtn onClick={onGoKnow}>去数据基地查看 →</FlowBtn>
          </div>
        </div>
      )}
    </FlowCard>
  )
}

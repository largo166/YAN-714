import { useCallback, useEffect, useState } from 'react'

import type { CleanupPreview, WorkspaceScan } from '@/lib/api'

import { knowledgeService as ks } from '../../services'
import { FlowBtn, FlowCard, FlowTonePill, type CardTone } from './flowKit'

/* b2 · 一键清理动作卡(流内版):status→scan(只读自动)→preview→两步确认 apply→restore。
   与 b1 CleanupOverlay 同端点同双闸;未配置=中性态深链 b1/项目中心。 */

function fmtSize(n: number) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB'
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(0) + ' KB'
  return n + ' B'
}

export function CleanupFlowCard() {
  const [step, setStep] = useState<'loading' | 'unconfigured' | 'scanned' | 'previewed' | 'applied' | 'error'>('loading')
  const [err, setErr] = useState('')
  const [scan, setScan] = useState<WorkspaceScan | null>(null)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState<{ moved: number; timestamp: string } | null>(null)
  const [restored, setRestored] = useState<{ restored: number; total: number } | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const st = await ks.workspaceStatus()
        if (!alive) return
        if (!st.workspace_path || !st.accessible) {
          setStep('unconfigured')
          return
        }
        const sc = await ks.workspaceScan()
        if (!alive) return
        setScan(sc)
        if (sc.accessible) setStep('scanned')
        else {
          setStep('error')
          setErr(sc.error || '工作目录不可访问')
        }
      } catch (e) {
        if (alive) {
          setStep('error')
          setErr((e as Error).message)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const doPreview = useCallback(async () => {
    setBusy(true); setErr('')
    try {
      setPreview(await ks.cleanupPreview())
      setStep('previewed')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [])

  const doApply = useCallback(async () => {
    if (!preview?.candidates?.length) return
    setBusy(true); setErr('')
    try {
      const r = await ks.cleanupApply(preview.candidates.map((c) => c.path))
      setApplied({ moved: r.moved ?? 0, timestamp: r.manifest?.timestamp ?? '' })
      setStep('applied')
      setConfirming(false)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [preview])

  const doRestore = useCallback(async () => {
    if (!applied?.timestamp) return
    setBusy(true); setErr('')
    try {
      const r = await ks.cleanupRestore(applied.timestamp)
      setRestored({ restored: r.restored ?? 0, total: r.total ?? 0 })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }, [applied])

  const tone: CardTone =
    step === 'loading' ? 'pending'
    : step === 'unconfigured' ? 'neutral'
    : step === 'error' ? 'error'
    : step === 'applied' ? 'ok'
    : busy ? 'pending' : 'ok'
  const pillText =
    step === 'loading' ? '读取中'
    : step === 'unconfigured' ? '未配置'
    : step === 'error' ? '失败'
    : step === 'applied' ? '已清理'
    : step === 'previewed' ? '待确认' : '已扫描'

  return (
    <FlowCard icon="🧹" title="一键清理 · 工作目录" pill={<FlowTonePill tone={tone} text={pillText} />}>
      {step === 'loading' && <div className="text-sk-muted2">正在读取工作目录状态…</div>}
      {step === 'unconfigured' && (
        <div className="text-sk-muted">
          尚未配置工作目录。请先到数据基地「一键清理」或项目中心的工作目录面板完成配置——营地不重建配置表单。
        </div>
      )}
      {step === 'error' && <div className="text-sk-risk">{err}</div>}

      {(step === 'scanned' || step === 'previewed' || step === 'applied') && scan && (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {([
            ['文件', String(scan.total_files)], ['文件夹', String(scan.total_dirs)],
            ['总大小', fmtSize(scan.total_size)], ['可自动清理', String(scan.auto_cleanable?.length ?? 0)],
          ] as const).map(([k, v]) => (
            <span key={k} className="text-[11.5px] text-sk-muted">
              <b className="mr-1 font-sans text-[15px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">{v}</b>{k}
            </span>
          ))}
        </div>
      )}

      {step === 'scanned' && (
        <div className="pt-1">
          <FlowBtn kind="primary" disabled={busy} onClick={doPreview}>{busy ? '生成预览中…' : '安全清理预览(只读)'}</FlowBtn>
        </div>
      )}

      {step === 'previewed' && preview && (
        (preview.count ?? 0) === 0 ? (
          <div className="text-sk-ok">目录很干净,没有可自动清理的项。</div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="text-[11.5px] text-sk-muted2">候选 {preview.count} 项 · 合计 {fmtSize(preview.total_size ?? 0)} · 全部仅移入隔离区</div>
            <div className="sk-scroll max-h-[130px] overflow-y-auto">
              {(preview.candidates ?? []).slice(0, 8).map((c) => (
                <div key={c.path} className="flex items-baseline gap-2 border-b-[0.5px] border-sk-hairsoft py-1 text-[11.5px] last:border-b-0">
                  <span className="flex-none rounded-full border-[0.5px] border-sk-hair px-2 text-[10px] text-sk-muted">{c.reason}</span>
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[#c9ccd0]">{c.path}</span>
                  <span className="flex-none text-sk-muted2">{fmtSize(c.size)}</span>
                </div>
              ))}
              {(preview.candidates?.length ?? 0) > 8 && (
                <div className="pt-1 text-[10.5px] text-sk-muted2">…其余 {preview.candidates!.length - 8} 项同规则收录</div>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {!confirming ? (
                <FlowBtn kind="primary" disabled={busy} onClick={() => setConfirming(true)}>执行清理</FlowBtn>
              ) : (
                <>
                  <FlowBtn kind="danger" disabled={busy} onClick={doApply}>{busy ? '移入中…' : `确认移入 ${preview.count} 项`}</FlowBtn>
                  <FlowBtn disabled={busy} onClick={() => setConfirming(false)}>取消</FlowBtn>
                </>
              )}
              <span className="text-[10.5px] text-sk-muted2">两步确认 · 移入隔离区,随时可撤销</span>
            </div>
          </div>
        )
      )}

      {step === 'applied' && applied && (
        <div className="flex flex-col gap-2">
          <div className="text-sk-ok">已移入隔离区 {applied.moved} 项(批次 {applied.timestamp})——未删除任何文件。</div>
          {restored ? (
            <div className="text-sk-primary">已撤销恢复 {restored.restored}/{restored.total} 项回原位。</div>
          ) : (
            <div className="flex items-center gap-2.5">
              <FlowBtn disabled={busy} onClick={doRestore}>{busy ? '恢复中…' : '↩ 一键撤销'}</FlowBtn>
              <span className="text-[10.5px] text-sk-muted2">撤销仅本次会话有效;隔离区长期保留</span>
            </div>
          )}
        </div>
      )}
      {err && step !== 'error' && <div className="text-[11.5px] text-sk-risk">{err}</div>}
    </FlowCard>
  )
}

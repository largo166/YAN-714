import { useCallback, useEffect, useState } from 'react'

import type { CleanupPreview, WorkspaceScan } from '@/lib/api'

import { knowledgeService as ks } from '../../services'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { GhostButton, Label, Pill } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* ═══ b1 · 一键清理浮层(海天化的 WorkspacePanel 能力,全走既有五件套端点) ═══
   status→scan(只读自动)→preview(只读)→apply(前端两步+后端 confirm 双闸)→restore(一键撤销)。
   未配置=中性态+去项目中心配置指引(营地/基地不建配置表单);撤销仅本会话有效,如实注明。 */

type Step = 'loading' | 'unconfigured' | 'scanned' | 'previewed' | 'applied' | 'error'

function fmtSize(n: number) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB'
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(0) + ' KB'
  return n + ' B'
}

export function CleanupOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('loading')
  const [err, setErr] = useState('')
  const [scan, setScan] = useState<WorkspaceScan | null>(null)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState<{ moved: number; timestamp: string } | null>(null)
  const [restored, setRestored] = useState<{ restored: number; total: number } | null>(null)

  const boot = useCallback(async () => {
    setStep('loading'); setErr(''); setPreview(null); setConfirming(false); setApplied(null); setRestored(null)
    try {
      const st = await ks.workspaceStatus()
      if (!st.workspace_path || !st.accessible) {
        setStep('unconfigured')
        return
      }
      const sc = await ks.workspaceScan() /* 只读 */
      setScan(sc)
      setStep(sc.accessible ? 'scanned' : 'error')
      if (!sc.accessible) setErr(sc.error || '工作目录不可访问')
    } catch (e) {
      setStep('error'); setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (open) void boot()
  }, [open, boot])

  /* 设置浮层改了工作目录 → 重读(杜绝「设置改了工作目录、清理浮层还是旧值」;仅浮层开着时) */
  useEffect(() => {
    if (!open) return
    const reboot = () => { void boot() }
    window.addEventListener('romai:settings-updated', reboot)
    return () => window.removeEventListener('romai:settings-updated', reboot)
  }, [open, boot])

  const doPreview = async () => {
    setBusy(true); setErr('')
    try {
      const p = await ks.cleanupPreview() /* 只读 */
      setPreview(p)
      setStep('previewed')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const doApply = async () => {
    if (!preview?.candidates?.length) return
    setBusy(true); setErr('')
    try {
      const r = await ks.cleanupApply(preview.candidates.map((c) => c.path))
      setApplied({ moved: r.moved ?? 0, timestamp: r.manifest?.timestamp ?? '' })
      setStep('applied')
      setConfirming(false)
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const doRestore = async () => {
    if (!applied?.timestamp) return
    setBusy(true); setErr('')
    try {
      const r = await ks.cleanupRestore(applied.timestamp)
      setRestored({ restored: r.restored ?? 0, total: r.total ?? 0 })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  if (!open) return null
  return (
    <div
      className="absolute inset-0 z-skoverlay flex items-center justify-center bg-[rgba(6,8,10,.55)] backdrop-blur-[6px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <GlassCard className="sk-scroll max-h-[80%] w-[min(680px,90%)] overflow-y-auto !bg-[rgba(10,12,14,.94)]">
        <CardHead
          title="一键清理 · 工作目录"
          en="Safe Cleanup"
          right={
            <span className="flex items-center gap-3">
              <HeadNote>只移入隔离区 · 永不删除</HeadNote>
              <GhostButton className="px-3.5 py-[5px]" onClick={onClose}>关闭</GhostButton>
            </span>
          }
        />

        {step === 'loading' && <div className="py-6 text-center font-skcjk text-[12.5px] font-light text-sk-muted2">正在读取工作目录状态…</div>}

        {step === 'unconfigured' && (
          <div className="flex flex-col gap-3 py-4">
            <div className="font-skcjk text-[13px] font-light leading-[1.9] text-sk-muted">
              尚未配置工作目录。清理功能作用于你的设计工作目录(扫描临时文件/缓存/副本,移入隔离区)——请先到项目中心的「工作目录」面板完成配置。
            </div>
            <Pill className="self-start">未配置 · 中性态</Pill>
          </div>
        )}

        {(step === 'scanned' || step === 'previewed' || step === 'applied') && scan && (
          <>
            <div className="flex flex-wrap gap-x-8 gap-y-2 py-1">
              {([
                ['文件', scan.total_files], ['文件夹', scan.total_dirs],
                ['总大小', fmtSize(scan.total_size)], ['可自动清理', scan.auto_cleanable?.length ?? 0],
              ] as const).map(([k, v]) => (
                <span key={k} className="font-skcjk text-[12px] font-light text-sk-muted">
                  <b className="mr-1.5 font-sans text-[18px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">{v}</b>{k}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(scan.type_stats || {}).slice(0, 8).map(([t, n]) => (
                <Pill key={t}>{t} {n}</Pill>
              ))}
            </div>
          </>
        )}

        {step === 'scanned' && (
          <div className="pt-2">
            <GhostButton pri disabled={busy} onClick={doPreview}>{busy ? '生成预览中…' : '安全清理预览(只读)'}</GhostButton>
          </div>
        )}

        {step === 'previewed' && preview && (
          <>
            {(preview.count ?? 0) === 0 ? (
              <div className="py-3 font-skcjk text-[13px] font-light text-sk-ok">目录很干净,没有可自动清理的项。</div>
            ) : (
              <>
                <div className="pt-1">
                  <Label>候选 {preview.count} 项 · 合计 {fmtSize(preview.total_size ?? 0)} · 全部仅移入隔离区</Label>
                </div>
                <div className="max-h-[200px] overflow-y-auto sk-scroll">
                  {(preview.candidates ?? []).slice(0, 12).map((c) => (
                    <MRow key={c.path} compact lead={<Pill>{c.reason}</Pill>} text={c.path} who={fmtSize(c.size)} />
                  ))}
                  {(preview.candidates?.length ?? 0) > 12 && (
                    <div className="pt-1.5 font-skcjk text-[11px] font-light text-sk-muted2">…other {(preview.candidates!.length - 12)} 项同规则收录</div>
                  )}
                </div>
                <div className="flex items-center gap-3 pt-2">
                  {!confirming ? (
                    <GhostButton pri disabled={busy} onClick={() => setConfirming(true)}>执行清理</GhostButton>
                  ) : (
                    <>
                      <GhostButton pri disabled={busy} onClick={doApply}>{busy ? '移入中…' : `确认移入 ${preview.count} 项`}</GhostButton>
                      <GhostButton disabled={busy} onClick={() => setConfirming(false)}>取消</GhostButton>
                    </>
                  )}
                  <span className="font-skcjk text-[11px] font-light text-sk-muted2">两步确认 · 移入隔离区,随时可撤销</span>
                </div>
              </>
            )}
          </>
        )}

        {step === 'applied' && applied && (
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="font-skcjk text-[13px] font-light text-sk-ok">
              已移入隔离区 {applied.moved} 项(批次 {applied.timestamp})——未删除任何文件。
            </div>
            {restored ? (
              <div className="font-skcjk text-[13px] font-light text-sk-primary">已撤销恢复 {restored.restored}/{restored.total} 项回原位。</div>
            ) : (
              <div className="flex items-center gap-3">
                <GhostButton disabled={busy} onClick={doRestore}>{busy ? '恢复中…' : '↩ 一键撤销'}</GhostButton>
                <span className="font-skcjk text-[11px] font-light text-sk-muted2">撤销仅本次会话有效;隔离区文件长期保留在 _ROMAI_CLEANUP_QUARANTINE/</span>
              </div>
            )}
          </div>
        )}

        {err && <div className="pt-1 font-skcjk text-[12.5px] font-light text-sk-risk">{err}</div>}
      </GlassCard>
    </div>
  )
}

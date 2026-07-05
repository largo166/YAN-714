import { useEffect, useState } from 'react'

import { api } from '@/lib/api'

import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { GhostButton, Pill } from '../common/PillButton'

/* ═══ 设置浮层(退役前置:紫黑 SettingsDrawer 的核心配置能力海天化) ═══
   四项:DeepSeek Key/仓库路径/工作目录/收件箱——全走既有端点,密钥只写不回显。 */

interface SettingsState {
  keySet: boolean
  repoPath: string
  wsPath: string
  inboxPath: string
}

export function SettingsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [st, setSt] = useState<SettingsState | null>(null)
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState({ key: '', repo: '', ws: '', inbox: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      try {
        const [s, w, i] = await Promise.allSettled([api.getSettings(), api.workspaceStatus(), api.inboxStatus()])
        if (!alive) return
        const settings = s.status === 'fulfilled' ? s.value : null
        const ws = w.status === 'fulfilled' ? w.value : null
        const ib = i.status === 'fulfilled' ? i.value : null
        setSt({
          keySet: settings?.deepseek_api_key_set ?? false,
          repoPath: settings?.repository_root_path ?? '',
          wsPath: ws?.workspace_path ?? '',
          inboxPath: ib?.inbox_root_path ?? '',
        })
        setDraft({ key: '', repo: settings?.repository_root_path ?? '', ws: ws?.workspace_path ?? '', inbox: ib?.inbox_root_path ?? '' })
      } catch (e) {
        if (alive) setErr((e as Error).message)
      }
    })()
    return () => {
      alive = false
    }
  }, [open])

  const save = async () => {
    setBusy(true); setMsg(''); setErr('')
    const done: string[] = []
    try {
      if (draft.key.trim()) {
        await api.updateSettings({ deepseek_api_key: draft.key.trim() })
        done.push('AI Key')
        setDraft((d) => ({ ...d, key: '' }))
      }
      if (draft.repo.trim() && draft.repo.trim() !== st?.repoPath) {
        await api.updateSettings({ repository_root_path: draft.repo.trim() })
        done.push('仓库')
      }
      if (draft.ws.trim() !== (st?.wsPath ?? '')) {
        await api.workspaceConfig(draft.ws.trim())
        done.push('工作目录')
      }
      if (draft.inbox.trim() !== (st?.inboxPath ?? '')) {
        await api.inboxConfig(draft.inbox.trim())
        done.push('收件箱')
      }
      setMsg(done.length ? `已保存:${done.join(' / ')}` : '没有改动。')
      /* 重拉状态 */
      const s = await api.getSettings()
      setSt((prev) => (prev ? { ...prev, keySet: s.deepseek_api_key_set, repoPath: s.repository_root_path } : prev))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  const row = 'flex items-center gap-3'
  const label = 'w-[96px] flex-none font-skcjk text-[12px] font-light tracking-[0.08em] text-sk-muted'
  const input =
    'min-w-0 flex-1 border-0 border-b border-sk-hair bg-transparent pb-1 font-skcjk text-[12.5px] font-light text-sk-fg outline-none placeholder:text-sk-muted2 focus:border-sk-primary transition-colors'

  return (
    <div
      className="absolute inset-0 z-skoverlay flex items-center justify-center bg-[rgba(6,8,10,.55)] backdrop-blur-[6px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <GlassCard className="w-[min(560px,90%)] !bg-[rgba(10,12,14,.94)]">
        <CardHead
          title="设置"
          en="Settings"
          right={
            <span className="flex items-center gap-3">
              <HeadNote>密钥仅写入 · 不回显</HeadNote>
              <GhostButton className="px-3.5 py-[5px]" onClick={onClose}>关闭</GhostButton>
            </span>
          }
        />
        {!st && !err && <div className="py-3 font-skcjk text-[12px] font-light text-sk-muted2">读取配置中…</div>}
        {st && (
          <div className="flex flex-col gap-4 py-1">
            <div className={row}>
              <span className={label}>DeepSeek Key</span>
              <input
                className={input}
                type="password"
                placeholder={st.keySet ? '已配置(留空不改;输入新值覆盖)' : '未配置 · 粘贴 API Key'}
                value={draft.key}
                onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              />
              <Pill tone={st.keySet ? 'ok' : 'default'}>{st.keySet ? '已配置' : '未配置'}</Pill>
            </div>
            <div className={row}>
              <span className={label}>知识仓库</span>
              <input className={input} placeholder="资料复制入库的根目录,如 C:\\仓库" value={draft.repo} onChange={(e) => setDraft((d) => ({ ...d, repo: e.target.value }))} />
            </div>
            <div className={row}>
              <span className={label}>工作目录</span>
              <input className={input} placeholder="一键清理作用的设计工作目录" value={draft.ws} onChange={(e) => setDraft((d) => ({ ...d, ws: e.target.value }))} />
            </div>
            <div className={row}>
              <span className={label}>收件箱</span>
              <input className={input} placeholder="60s 自动扫描入库的目录(留空=停用)" value={draft.inbox} onChange={(e) => setDraft((d) => ({ ...d, inbox: e.target.value }))} />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <GhostButton pri onClick={() => void save()}>{busy ? '保存中…' : '保存'}</GhostButton>
              {msg && <span className="font-skcjk text-[11.5px] font-light text-sk-ok">{msg}</span>}
              {err && <span className="font-skcjk text-[11.5px] font-light text-sk-risk">{err}</span>}
            </div>
          </div>
        )}
        {err && !st && <div className="py-2 font-skcjk text-[12px] font-light text-sk-risk">{err}</div>}
      </GlassCard>
    </div>
  )
}

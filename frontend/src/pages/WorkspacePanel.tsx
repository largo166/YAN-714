import { useCallback, useEffect, useState } from 'react'
import { FileText, Folder, HardDrive, Lock } from 'lucide-react'

import { api, type CleanupPreview, type WorkspaceScan } from '@/lib/api'

function fmtSize(n: number): string {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB'
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KB'
  return n + ' B'
}

/** 项目目录管理 + 安全清理（4C）。沿用原 ROM-AI 卡片/metric/sec/kbrow 样式。
 *  scan/preview 只读；apply 需两步确认后移入隔离区(永不删除)，并提供一键撤销恢复(v2红线 归档可逆)。 */
export default function WorkspacePanel() {
  const [path, setPath] = useState('')
  const [input, setInput] = useState('')
  const [accessible, setAccessible] = useState(false)
  const [scan, setScan] = useState<WorkspaceScan | null>(null)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmApply, setConfirmApply] = useState(false)
  const [lastQuarantine, setLastQuarantine] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.workspaceStatus()
      setPath(s.workspace_path)
      setInput(s.workspace_path)
      setAccessible(s.accessible)
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const saveConfig = async () => {
    setErr(null)
    try {
      const s = await api.workspaceConfig(input.trim())
      setPath(s.workspace_path)
      setAccessible(s.accessible)
      setScan(null)
      setPreview(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const doScan = async () => {
    setBusy(true)
    setErr(null)
    try {
      const s = await api.workspaceScan()
      setScan(s)
      setAccessible(s.accessible)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doPreview = async () => {
    setBusy(true)
    setErr(null)
    setConfirmApply(false)
    setActionMsg(null)
    try {
      setPreview(await api.cleanupPreview())
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doApply = async () => {
    const cands = preview?.candidates ?? []
    if (cands.length === 0 || busy) return
    setBusy(true)
    setErr(null)
    setActionMsg(null)
    try {
      const r = await api.cleanupApply(cands.map((c) => c.path))
      if (r.ok) {
        const ts = r.manifest?.timestamp || ''
        setLastQuarantine(ts)
        setActionMsg(`已移入隔离区 ${r.moved ?? 0} 项（时间戳 ${ts}）——未删除,可一键撤销。`)
        setPreview(null) // 已执行,清空预览
        setConfirmApply(false)
      } else {
        setErr(r.error || '清理失败')
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doRestore = async () => {
    if (!lastQuarantine || busy) return
    setBusy(true)
    setErr(null)
    try {
      const r = await api.cleanupRestore(lastQuarantine)
      if (r.ok) {
        setActionMsg(`已撤销恢复 ${r.restored ?? 0}/${r.total ?? 0} 项回原位。`)
        setLastQuarantine(null)
      } else {
        setErr(r.error || '恢复失败')
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card mt">
      <div className="ct">
        项目目录 · 读取与安全清理
        <span className={'statpill ' + (accessible ? 'live' : 'demo')}>
          {accessible ? '已连接' : '未连接'}
        </span>
      </div>

      <div className="pathin" style={{ marginTop: 0 }}>
        <input
          value={input}
          placeholder="项目目录绝对路径，如 C:\Users\...\项目"
          onChange={(e) => setInput(e.target.value)}
        />
        <span className="br" onClick={saveConfig}>
          设为当前
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mut)', margin: '4px 2px 0' }}>
        当前：{path || '（未配置）'}
      </div>

      <div className="btnrow">
        <button className="btn" onClick={doScan} disabled={busy || !path}>
          {busy ? '处理中…' : '⟳ 扫描目录'}
        </button>
        <button className="btn ghost" onClick={doPreview} disabled={busy || !path}>
          🧹 安全清理预览
        </button>
      </div>

      <div className="setnote" style={{ marginTop: 10 }}>
        <Lock size={12} style={{ verticalAlign: -2, marginRight: 4 }} />安全清理：不会永久删除，只把文件移动到隔离区 <code>_ROMAI_CLEANUP_QUARANTINE/</code>，并写
        manifest，可一键恢复。对真实项目目录执行 apply 前需用户单独确认。
      </div>

      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

      {scan && scan.accessible && (
        <>
          <div className="grid4 mt">
            <div className="metric">
              <div className="l"><FileText size={12} style={{ verticalAlign: -2, marginRight: 4 }} />文件</div>
              <div className="v">{scan.total_files}</div>
            </div>
            <div className="metric">
              <div className="l"><Folder size={12} style={{ verticalAlign: -2, marginRight: 4 }} />文件夹</div>
              <div className="v">{scan.total_dirs}</div>
            </div>
            <div className="metric">
              <div className="l"><HardDrive size={12} style={{ verticalAlign: -2, marginRight: 4 }} />总大小</div>
              <div className="v" style={{ fontSize: 20 }}>
                {fmtSize(scan.total_size)}
              </div>
            </div>
            <div className="metric">
              <div className="l">⚠ 可清理 / 复核</div>
              <div className="v t" style={{ fontSize: 20 }}>
                {scan.auto_cleanable.length} / {scan.review_items.length}
              </div>
            </div>
          </div>

          <div className="ct mt">文件类型分布</div>
          <div className="tags">
            {Object.entries(scan.type_stats)
              .sort((a, b) => b[1] - a[1])
              .map(([ext, n]) => (
                <span className="tg" key={ext}>
                  <span className="k">{ext}</span>
                  {n}
                </span>
              ))}
          </div>

          <div className="ct mt">最近修改</div>
          {scan.recent_files.slice(0, 6).map((f) => (
            <div className="kbrow" key={f.abs_path}>
              <span className="pth">{f.path}</span>
              <span className="meta">{fmtSize(f.size)}</span>
            </div>
          ))}

          <div className="ct mt">大文件</div>
          {scan.large_files.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--mut)', padding: 4 }}>无超过阈值的大文件</div>
          )}
          {scan.large_files.slice(0, 6).map((f) => (
            <div className="kbrow" key={f.abs_path}>
              <span className="pth">{f.path}</span>
              <span className="meta" style={{ color: 'var(--terra)' }}>
                {fmtSize(f.size)}
              </span>
            </div>
          ))}

          <div className="ct mt">人工复核（设计 / 模型 / 文档源文件，不自动清理）</div>
          {scan.review_items.slice(0, 8).map((f) => (
            <div className="kbrow" key={f.abs_path}>
              <span className="pth">{f.path}</span>
              <span className="meta">{f.ext}</span>
            </div>
          ))}
        </>
      )}

      {scan && !scan.accessible && (
        <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>
          目录不可访问：{scan.error}
        </div>
      )}

      {preview && (
        <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
          <div className="ct">清理预览（只读，未移动任何文件）</div>
          <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
            自动可清理候选 <b>{preview.count ?? 0}</b> 项（{fmtSize(preview.total_size ?? 0)}）· 人工复核{' '}
            <b>{preview.review_count ?? 0}</b> 项
          </div>
          {(preview.count ?? 0) === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ok)', marginTop: 8 }}>
              ✓ 未发现可自动清理的临时/缓存/重复文件，目录很干净。
            </div>
          ) : (
            <>
              <div style={{ marginTop: 8 }}>
                {preview.candidates?.slice(0, 12).map((c) => (
                  <div className="kbrow" key={c.abs_path}>
                    <span className="pth">{c.path}</span>
                    <span className="meta">{c.reason}</span>
                  </div>
                ))}
              </div>
              {/* 两步确认执行：移入隔离区,永不删除,可撤销 */}
              <div className="btnrow" style={{ marginTop: 10 }}>
                {!confirmApply ? (
                  <button className="btn" disabled={busy} onClick={() => setConfirmApply(true)}>
                    🧹 执行清理（移入隔离区）
                  </button>
                ) : (
                  <>
                    <button className="btn" disabled={busy} onClick={doApply} style={{ background: 'var(--terra)', color: '#fff' }}>
                      {busy ? '执行中…' : `确认移入隔离区 ${preview.count} 项`}
                    </button>
                    <button className="btn ghost" disabled={busy} onClick={() => setConfirmApply(false)}>
                      取消
                    </button>
                  </>
                )}
              </div>
              {confirmApply && (
                <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>
                  只移动到 <code>_ROMAI_CLEANUP_QUARANTINE/</code>，不删除；执行后可一键撤销。
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 执行结果 + 一键撤销 */}
      {actionMsg && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink2)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{actionMsg}</span>
          {lastQuarantine && (
            <button className="btn ghost" disabled={busy} onClick={doRestore}>
              ↩ 一键撤销恢复
            </button>
          )}
        </div>
      )}
    </div>
  )
}

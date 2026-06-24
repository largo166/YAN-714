import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { BRIEF_FIELDS } from '@/types/schemas'
import type { ProjectCognition } from '@/types/schemas'

/** 任务书结构化认知卡（P2 脊椎前端）：
 *  AI 抽取16字段 → 可编辑 → 人工确认。缺口字段标「待补」，不伪造。
 *  这是把项目从"一堆资料"升级为"结构化认知"的入口。 */
export default function BriefCognitionCard({ projectId }: { projectId: number | null }) {
  const [cog, setCog] = useState<ProjectCognition | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    if (projectId == null) {
      setCog(null)
      return
    }
    try {
      const items = await api.listCognition(projectId)
      // 取最新一条 brief
      setCog(items.find((c) => c.module === 'brief') ?? null)
    } catch {
      setCog(null)
    }
  }, [projectId])

  useEffect(() => {
    load()
    setNote(null)
    setEditing(false)
  }, [load])

  const extract = async () => {
    if (projectId == null || busy) return
    setBusy(true)
    setNote(null)
    try {
      const r = await api.extractBrief(projectId)
      if (r.status === 'ok' && r.cognition) {
        setCog(r.cognition)
        setNote('已抽取任务书16字段（草案，请核对后确认）')
      } else if (r.status === 'not_configured') {
        setNote('AI 未配置，请到设置页配置 DeepSeek API Key（不会伪造）')
      } else if (r.status === 'no_material') {
        setNote('本项目暂无任务书材料。请先在「项目文件」上传任务书并入库。')
      } else {
        setNote(`抽取失败：${r.error_message || r.message}`)
      }
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (projectId == null || !cog || busy) return
    setBusy(true)
    try {
      setCog(await api.confirmCognition(projectId, cog.id))
      setNote('已确认。共创营地/AI 研判将优先据此认知推演。')
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveEdits = async () => {
    if (projectId == null || !cog || busy) return
    setBusy(true)
    try {
      setCog(await api.updateCognition(projectId, cog.id, edits))
      setEditing(false)
      setNote('已保存（回到草案，请重新确认）')
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (projectId == null) return null

  const filled = cog ? BRIEF_FIELDS.filter((f) => (cog.fields[f] || '').trim()).length : 0

  return (
    <div className="card mt">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="ct" style={{ margin: 0 }}>
          任务书结构化认知{' '}
          {cog && (
            <span className={'statpill ' + (cog.status === 'confirmed' ? 'live' : 'demo')}>
              {cog.status === 'confirmed' ? '已确认' : '草案'} · {filled}/{BRIEF_FIELDS.length} 字段
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="anbtn" disabled={busy} onClick={extract}>
            {busy ? '处理中…' : cog ? '重新抽取' : 'AI 抽取任务书'}
          </button>
          {cog && cog.status !== 'confirmed' && !editing && (
            <button className="anbtn" disabled={busy} onClick={confirm}>确认</button>
          )}
          {cog && !editing && (
            <button className="anbtn" onClick={() => { setEdits(cog.fields); setEditing(true) }}>编辑</button>
          )}
          {editing && (
            <button className="anbtn" disabled={busy} onClick={saveEdits}>保存</button>
          )}
        </div>
      </div>

      {!cog && (
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '4px 0' }}>
          尚未建立任务书结构化认知。上传任务书入库后，点「AI 抽取任务书」把它读成 16 字段结构化判断。
        </div>
      )}

      {cog && cog.summary_md && (
        <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '4px 0 8px', padding: '8px 10px', background: 'var(--terra-soft)', borderRadius: 8 }}>
          📋 {cog.summary_md}
        </div>
      )}

      {cog && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {BRIEF_FIELDS.map((f) => {
            const v = (cog.fields[f] || '').trim()
            return (
              <div key={f} style={{ fontSize: 12.5, display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--mut)', minWidth: 110, flexShrink: 0 }}>{f}</span>
                {editing ? (
                  <input
                    value={edits[f] ?? v}
                    onChange={(e) => setEdits((s) => ({ ...s, [f]: e.target.value }))}
                    style={{ flex: 1, fontSize: 12, padding: '2px 6px', border: '1px solid var(--line2)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--ink)' }}
                  />
                ) : v ? (
                  <span style={{ color: 'var(--ink)' }}>{v}</span>
                ) : (
                  <span style={{ color: 'var(--terra)', opacity: 0.6 }}>待补</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {note && <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 8 }}>{note}</div>}
    </div>
  )
}

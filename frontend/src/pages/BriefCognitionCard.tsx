import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type { CognitionField, ProjectCognition } from '@/types/schemas'

/** 任务书结构化认知卡（Schema 规格 v1.0 前端）：
 *  每字段按 extractable 分档展示——high/medium 带出处、low 标"AI判断·草案"、manual_only 显引导问题。
 *  只 confirmed 字段会被共创营地推演注入。逐字段编辑/确认，不伪造。 */
function valStr(v: unknown): string {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(String).join('、')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function fieldBadge(f: CognitionField): { text: string; cls: string } {
  if (f.status === 'confirmed') return { text: '已确认', cls: 'live' }
  if (f.status === 'empty') {
    return f.extractable === 'manual_only'
      ? { text: '待人工填', cls: 'demo' }
      : { text: '未抽到', cls: 'demo' }
  }
  // draft
  return f.extractable === 'low'
    ? { text: 'AI判断·草案', cls: 'demo' }
    : { text: '草案', cls: 'demo' }
}

export default function BriefCognitionCard({ projectId }: { projectId: number | null }) {
  const [cog, setCog] = useState<ProjectCognition | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const load = useCallback(async () => {
    if (projectId == null) {
      setCog(null)
      return
    }
    try {
      const items = await api.listCognition(projectId)
      setCog(items.find((c) => c.module === 'brief') ?? null)
    } catch {
      setCog(null)
    }
  }, [projectId])

  useEffect(() => {
    load()
    setNote(null)
    setEditKey(null)
  }, [load])

  const extract = async () => {
    if (projectId == null || busy) return
    setBusy(true)
    setNote(null)
    try {
      const r = await api.extractBrief(projectId)
      if (r.status === 'ok' && r.cognition) {
        setCog(r.cognition)
        setNote('已按字段分档抽取（事实=草案待审，判断=AI草案，核心判断=待人工填）')
      } else if (r.status === 'not_configured') {
        setNote('AI 未配置，请到设置页配置 DeepSeek API Key（不会伪造）')
      } else if (r.status === 'no_material') {
        setNote('本项目暂无可全文解析的任务书材料（大文件仅登记元数据、无正文）。请上传可解析的任务书。')
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
      setNote('已确认事实字段。判断/核心字段请逐条编辑确认。共创营地将注入已确认字段。')
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveField = async (key: string) => {
    if (projectId == null || !cog || busy) return
    setBusy(true)
    try {
      setCog(await api.updateCognition(projectId, cog.id, { [key]: { value: editVal, status: 'confirmed' } }))
      setEditKey(null)
      setNote('已保存并确认该字段。')
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (projectId == null) return null

  const confirmedCount = cog ? cog.fields.filter((f) => f.status === 'confirmed').length : 0

  return (
    <div className="card mt">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="ct" style={{ margin: 0 }}>
          任务书结构化认知{' '}
          {cog && (
            <span className={'statpill ' + (cog.module_status === 'confirmed' ? 'live' : 'demo')}>
              {cog.module_status} · 已确认 {confirmedCount}/{cog.fields.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="anbtn" disabled={busy} onClick={extract}>
            {busy ? '处理中…' : cog ? '重新抽取' : 'AI 抽取任务书'}
          </button>
          {cog && (
            <button className="anbtn" disabled={busy} onClick={confirm} title="确认事实类(high/medium)字段">
              确认事实字段
            </button>
          )}
        </div>
      </div>

      {!cog && (
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '4px 0' }}>
          尚未建立任务书结构化认知。上传可解析任务书入库后，点「AI 抽取任务书」按 16 字段分档读取（事实带出处、判断给草案、核心留人工）。
        </div>
      )}

      {cog && cog.summary_md && (
        <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '4px 0 8px', padding: '8px 10px', background: 'var(--terra-soft)', borderRadius: 8 }}>
          📋 {cog.summary_md}
        </div>
      )}

      {cog && (
        <div style={{ display: 'grid', gap: 6 }}>
          {cog.fields.map((f) => {
            const b = fieldBadge(f)
            const v = valStr(f.value)
            const editing = editKey === f.key
            return (
              <div key={f.key} style={{ fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--mut)', minWidth: 120, flexShrink: 0 }}>{f.label}</span>
                <span className={'statpill ' + b.cls} style={{ flexShrink: 0, fontSize: 10 }}>{b.text}</span>
                <span style={{ flex: 1 }}>
                  {editing ? (
                    <span style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        style={{ flex: 1, fontSize: 12, padding: '2px 6px', border: '1px solid var(--line2)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--ink)' }}
                      />
                      <button className="anbtn" disabled={busy} onClick={() => saveField(f.key)}>存</button>
                      <button className="anbtn" onClick={() => setEditKey(null)}>取消</button>
                    </span>
                  ) : f.extractable === 'manual_only' && f.status === 'empty' ? (
                    <span
                      style={{ color: 'var(--terra)', cursor: 'pointer' }}
                      title="点击人工填写"
                      onClick={() => { setEditKey(f.key); setEditVal('') }}
                    >
                      ❓ {f.guide || '需人工判断填写'}
                    </span>
                  ) : v ? (
                    <span
                      style={{ color: 'var(--ink)', cursor: 'pointer' }}
                      title={f.source?.type === 'doc' ? '来源：原文档' : f.source?.type === 'inference' ? 'AI 推理草案' : '人工填写'}
                      onClick={() => { setEditKey(f.key); setEditVal(v) }}
                    >
                      {v}
                      {f.source?.type === 'inference' && <span style={{ color: 'var(--mut)', marginLeft: 4 }}>（推理）</span>}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--mut)', cursor: 'pointer' }} onClick={() => { setEditKey(f.key); setEditVal('') }}>待补</span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {note && <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 8 }}>{note}</div>}
    </div>
  )
}

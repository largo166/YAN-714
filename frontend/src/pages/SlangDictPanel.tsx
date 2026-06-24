import { useEffect, useState } from 'react'

import { api } from '@/lib/api'

type Entry = { term: string; meaning: string; impact: string; action: string }

/** 甲方诉求 / 黑话词典查询：原话 → 真实含义 / 设计影响 / 建议动作。
 *  接 GET /api/projects/{id}/slang（此前后端有、前端未挂）。可折叠,默认收起。 */
export default function SlangDictPanel({ projectId }: { projectId: number | null }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [items, setItems] = useState<Entry[]>([])
  const [loaded, setLoaded] = useState(false)

  const search = async (kw: string) => {
    if (projectId == null) return
    try {
      setItems(await api.querySlang(projectId, kw))
      setLoaded(true)
    } catch {
      setItems([])
      setLoaded(true)
    }
  }

  useEffect(() => {
    if (open && !loaded && projectId != null) search('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId])

  if (projectId == null) return null

  return (
    <div className="card mt">
      <div className="ct" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} 甲方诉求词典（黑话翻译）
        <span className="statpill demo">原话→真实含义/影响/动作</span>
      </div>
      {open && (
        <>
          <div className="pathin" style={{ marginTop: 6 }}>
            <input
              value={q}
              placeholder="输入甲方原话关键词，如「高端大气」「国际化」…（留空看全部）"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search(q)}
            />
            <span className="br" onClick={() => search(q)}>
              查
            </span>
          </div>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {loaded && items.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--mut)' }}>无匹配词条。</div>
            )}
            {items.map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, padding: '6px 8px', background: 'var(--panel2)', borderRadius: 8 }}>
                <div><b>{e.term}</b></div>
                <div style={{ color: 'var(--ink2)', marginTop: 2 }}>含义：{e.meaning}</div>
                <div style={{ color: 'var(--mut)', marginTop: 1 }}>影响：{e.impact}</div>
                <div style={{ color: 'var(--terra)', marginTop: 1 }}>建议：{e.action}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

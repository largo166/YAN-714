import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type { CrossProjectItemOut } from '@/types/schemas'

type LibItem = CrossProjectItemOut

/** B 类跨项目复用库（阶段3）：6 类别 + 各类已沉淀条目。全局可检索复用,跨项目。
 *  只读展示——沉淀入口在认知卡上（已确认认知才能沉淀,不伪造）。 */
export default function CrossProjectLibrary() {
  const [types, setTypes] = useState<{ type: string; label: string; count: number }[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [items, setItems] = useState<LibItem[]>([])

  const loadTypes = useCallback(async () => {
    try {
      setTypes(await api.listCrossProjectTypes())
    } catch {
      setTypes([])
    }
  }, [])

  useEffect(() => {
    loadTypes()
  }, [loadTypes])

  useEffect(() => {
    api
      .listCrossProjectLibrary(active ?? undefined)
      .then((r) => setItems(r))
      .catch(() => setItems([]))
  }, [active])

  const total = types.reduce((s, t) => s + t.count, 0)

  return (
    <div className="card mt">
      <div className="ct" style={{ marginBottom: 8 }}>
        跨项目复用库（B1–B6）{' '}
        <span className="statpill demo">{total} 条已沉淀</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <button
          className="anbtn"
          style={active === null ? { background: 'var(--terra)', color: '#fff', fontSize: 12 } : { fontSize: 12 }}
          onClick={() => setActive(null)}
        >
          全部
        </button>
        {types.map((t) => (
          <button
            key={t.type}
            className="anbtn"
            style={active === t.type ? { background: 'var(--terra)', color: '#fff', fontSize: 12 } : { fontSize: 12 }}
            onClick={() => setActive(t.type)}
          >
            {t.label}（{t.count}）
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div style={{ color: 'var(--mut)', fontSize: 13 }}>
          暂无沉淀条目。在项目中心确认某模块认知后，可「沉淀到跨项目库」供其它项目复用（只沉淀已确认内容，不伪造）。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {items.map((it) => (
            <div key={it.document_id} style={{ fontSize: 12.5, padding: '6px 8px', background: 'var(--panel2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="statpill demo" style={{ fontSize: 10 }}>{it.label}</span>
                <b>{it.title}</b>
              </div>
              <div style={{ color: 'var(--ink2)', marginTop: 2 }}>{it.description || it.snippet}</div>
              {it.resource && <div style={{ color: 'var(--mut)', fontSize: 11, marginTop: 2 }}>{it.resource}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

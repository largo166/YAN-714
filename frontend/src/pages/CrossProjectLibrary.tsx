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
      <div className="ct mb-2">
        跨项目复用库（B1–B6）{' '}
        <span className="statpill demo">{total} 条已沉淀</span>
      </div>
      <div className="flex flex-wrap gap-[6px] mb-2">
        <button
          className="anbtn text-[12px]"
          style={active === null ? { background: 'rgba(124,92,255,.14)', border: '1px solid rgba(124,92,255,.55)', color: '#cfc4ff' } : undefined}
          onClick={() => setActive(null)}
        >
          全部
        </button>
        {types.map((t) => (
          <button
            key={t.type}
            className="anbtn text-[12px]"
            style={active === t.type ? { background: 'rgba(124,92,255,.14)', border: '1px solid rgba(124,92,255,.55)', color: '#cfc4ff' } : undefined}
            onClick={() => setActive(t.type)}
          >
            {t.label}（{t.count}）
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="text-muted-foreground text-[13px]">
          暂无沉淀条目。在项目中心确认某模块认知后，点「沉淀到跨项目库」，这条经验就能被其它项目复用。
        </div>
      ) : (
        <div className="grid gap-[6px]">
          {items.map((it) => (
            <div key={it.document_id} className="text-[12.5px] py-[6px] px-2 bg-popover rounded-[8px]">
              <div className="flex gap-[6px] items-center">
                <span className="statpill demo text-[10px]">{it.label}</span>
                <b>{it.title}</b>
              </div>
              <div className="text-secondary-foreground mt-[2px]">{it.description || it.snippet}</div>
              {it.resource && <div className="text-muted-foreground text-[11px] mt-[2px]">{it.resource}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

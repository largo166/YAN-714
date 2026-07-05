import { useEffect, useMemo, useState } from 'react'

import type { KnowledgeStats } from '@/types/schemas'

import { knowledgeService as ks } from '../services'

/* b1 数据基地真源聚合:stats + 文档列表(类型分布/最近5) + 收件箱状态。
   一次加载,三态如实(loading/err);类型分布由文档列表前端聚合(与紫黑口径一致)。 */

export interface DocLite {
  id: number
  title: string
  type: string
  created_at: string
}

export interface KnowledgeLive {
  loading: boolean
  err: string | null
  stats: KnowledgeStats | null
  typeStats: [string, number][]
  recent: DocLite[]
  inbox: { configured: boolean; accessible: boolean; pending: number } | null
}

export function useKnowledgeLive(active: boolean): KnowledgeLive {
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [docs, setDocs] = useState<DocLite[]>([])
  const [inbox, setInbox] = useState<KnowledgeLive['inbox']>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!active || loaded) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [st, dl] = await Promise.all([ks.stats(), ks.listDocs()])
        if (!alive) return
        setStats(st)
        setDocs(dl.items.map((d) => ({ id: d.id, title: d.title, type: d.type || '其他', created_at: d.created_at })))
        setErr(null)
        setLoaded(true)
      } catch (e) {
        if (alive) setErr((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [active, loaded])

  /* 收件箱状态独立 effect:失败不拖垮主数据,StrictMode 双挂载下也能补拉 */
  useEffect(() => {
    if (!active || inbox) return
    let alive = true
    ks.inboxStatus()
      .then((ib) => {
        if (alive) setInbox({ configured: !!ib.inbox_root_path, accessible: ib.accessible, pending: ib.pending })
      })
      .catch(() => {
        /* 状态端点失败即不显示 pill,不伪造 */
      })
    return () => {
      alive = false
    }
  }, [active, inbox])

  const typeStats = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of docs) m.set(d.type, (m.get(d.type) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [docs])

  const recent = useMemo(() => docs.slice(0, 5), [docs])

  return { loading, err, stats, typeStats, recent, inbox }
}

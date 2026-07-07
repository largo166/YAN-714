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
  /* hotfix1(2026-07-07):去 loaded 一次性闸,改 ver 驱动可刷新。
     入库完成后前端派 'romai:knowledge-updated' 事件 → ver++ → 首页重拉真实统计,
     根治「抽屉入库 8、首页仍显示旧 0」(旧 loaded flag 只加载一次永不刷新)。 */
  const [ver, setVer] = useState(0)

  useEffect(() => {
    if (!active) return
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const [st, dl] = await Promise.all([ks.stats(), ks.listDocs()])
        if (!alive) return
        setStats(st)
        setDocs(dl.items.map((d) => ({ id: d.id, title: d.title, type: d.type || '其他', created_at: d.created_at })))
        setErr(null)
      } catch (e) {
        if (alive) setErr((e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [active, ver])

  /* 入库/知识库变更事件 → 触发重拉(仅活跃时;不活跃时下次进板的 active 变化会自然重拉) */
  useEffect(() => {
    const bump = () => setVer((v) => v + 1)
    window.addEventListener('romai:knowledge-updated', bump)
    return () => window.removeEventListener('romai:knowledge-updated', bump)
  }, [])

  /* 收件箱状态:随 ver 同刷(入库后待处理数可能变),失败不拖垮主数据 */
  useEffect(() => {
    if (!active) return
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
  }, [active, ver])

  const typeStats = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of docs) m.set(d.type, (m.get(d.type) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [docs])

  const recent = useMemo(() => docs.slice(0, 5), [docs])

  return { loading, err, stats, typeStats, recent, inbox }
}

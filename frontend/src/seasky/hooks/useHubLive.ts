import { useEffect, useRef, useState } from 'react'

import type { Agent, Broadcast, TeamMember } from '@/types/schemas'

import { hubService as hs } from '../services'

/* b3 协作平台真源聚合:成员/甲方画像/智能体/通知,独立失败不互拖。
   封板可信度包(2026-07-08):errs 聚合为 err 供板内渲染(错误不再静默成空列表);
   监听 romai:broadcast-updated(驾驶舱发通知→横幅即时更新,事件命名约定)。
   B④(2026-07-09):ver 驱动重试(reload),取代一次性 loaded 闸——失败可重拉。 */

export interface HubLive {
  loading: boolean
  members: TeamMember[]
  clients: { name: string; project_count: number }[]
  agents: Agent[]
  broadcasts: Broadcast[]
  errs: string[]
  /** 四源任一失败的聚合提示(null=全部成功)。板内渲染用,错误≠空库。 */
  err: string | null
  reloadMembers: () => void
  /** 全量重拉(B④ 重试态用):bump ver 强制重新聚合四源。 */
  reload: () => void
}

export function useHubLive(active: boolean): HubLive {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [clients, setClients] = useState<{ name: string; project_count: number }[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [errs, setErrs] = useState<string[]>([])
  const [ver, setVer] = useState(0)
  const fetchedVer = useRef(-1)
  const [memberVer, setMemberVer] = useState(0)

  useEffect(() => {
    if (!active || fetchedVer.current === ver) return
    fetchedVer.current = ver
    let alive = true
    setLoading(true)
    ;(async () => {
      const [m, c, a, b] = await Promise.allSettled([
        hs.listTeamMembers(),
        hs.listClients(),
        hs.listAgents(),
        hs.listBroadcasts(),
      ])
      if (!alive) return
      const es: string[] = []
      if (m.status === 'fulfilled') setMembers(m.value)
      else es.push(`成员:${m.reason}`)
      if (c.status === 'fulfilled') setClients(c.value.items)
      else es.push(`甲方:${c.reason}`)
      if (a.status === 'fulfilled') setAgents(a.value)
      else es.push(`智能体:${a.reason}`)
      if (b.status === 'fulfilled') setBroadcasts(b.value)
      else es.push(`通知:${b.reason}`)
      setErrs(es)
      setLoading(false)
      if (es.length === 4) fetchedVer.current = -1 /* 全败不锁定:可重试 */
    })()
    return () => {
      alive = false
    }
  }, [active, ver])

  /* 成员增删后局部重拉 */
  useEffect(() => {
    if (memberVer === 0) return
    let alive = true
    hs.listTeamMembers().then((m) => alive && setMembers(m)).catch(() => null)
    return () => {
      alive = false
    }
  }, [memberVer])

  /* 驾驶舱发通知 → 协作板横幅即时重拉(romai:broadcast-updated,一类数据一事件) */
  useEffect(() => {
    const onBroadcast = () => {
      hs.listBroadcasts().then(setBroadcasts).catch(() => null)
    }
    window.addEventListener('romai:broadcast-updated', onBroadcast)
    return () => window.removeEventListener('romai:broadcast-updated', onBroadcast)
  }, [])

  return {
    loading, members, clients, agents, broadcasts, errs,
    err: errs.length ? `部分数据加载失败——${errs.join(' / ')}` : null,
    reloadMembers: () => setMemberVer((v) => v + 1),
    reload: () => setVer((v) => v + 1),
  }
}

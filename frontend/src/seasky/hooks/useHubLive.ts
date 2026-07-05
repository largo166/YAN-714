import { useEffect, useState } from 'react'

import type { Agent, Broadcast, TeamMember } from '@/types/schemas'

import { hubService as hs } from '../services'

/* b3 协作平台真源聚合:成员/甲方画像/智能体/通知,独立失败不互拖 */

export interface HubLive {
  loading: boolean
  members: TeamMember[]
  clients: { name: string; project_count: number }[]
  agents: Agent[]
  broadcasts: Broadcast[]
  errs: string[]
  reloadMembers: () => void
}

export function useHubLive(active: boolean): HubLive {
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [clients, setClients] = useState<{ name: string; project_count: number }[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [errs, setErrs] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [memberVer, setMemberVer] = useState(0)

  useEffect(() => {
    if (!active || loaded) return
    let alive = true
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
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [active, loaded])

  /* 成员增删后局部重拉 */
  useEffect(() => {
    if (memberVer === 0) return
    let alive = true
    hs.listTeamMembers().then((m) => alive && setMembers(m)).catch(() => null)
    return () => {
      alive = false
    }
  }, [memberVer])

  return { loading, members, clients, agents, broadcasts, errs, reloadMembers: () => setMemberVer((v) => v + 1) }
}

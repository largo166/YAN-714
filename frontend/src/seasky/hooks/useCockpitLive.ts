import { useCallback, useEffect, useState } from 'react'

import type { AiUsageItem, BossDashboard, Broadcast, WorkloadItem } from '@/types/schemas'

import { cockpitService as cks } from '../services'

/* b4 驾驶舱真源:用户已取消门禁，进入即拉用量/工作量/大盘/广播;
   日历=前端聚合(里程碑单源起步,会议聚合后补——降级预案已批)。
   封板可信度包(2026-07-08):数据层加 err(四源/日历失败不再静默丢弃,错误≠空库);
   sendBroadcast 成功后派发 romai:broadcast-updated(协作板横幅即时更新)。 */

export interface CalendarEvent {
  date: string /* YYYY-MM-DD */
  label: string
  projIdx: number
}

export interface CockpitLive {
  gate: 'open'
  loading: boolean
  usage: AiUsageItem[]
  workload: WorkloadItem[]
  dash: BossDashboard | null
  broadcasts: Broadcast[]
  calEvents: CalendarEvent[]
  /** 数据源失败聚合提示(null=全部成功)。板内渲染用,失败不再伪装成空态。 */
  err: string | null
  sendBroadcast: (text: string) => Promise<void>
  /** 手动重试(B④):bump dataVer 强制重拉四源 + 日历。 */
  reload: () => void
}

export function useCockpitLive(active: boolean, projectIds: number[]): CockpitLive {
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<AiUsageItem[]>([])
  const [workload, setWorkload] = useState<WorkloadItem[]>([])
  const [dash, setDash] = useState<BossDashboard | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([])
  const [errs, setErrs] = useState<string[]>([])
  const [calErr, setCalErr] = useState('')
  const [dataVer, setDataVer] = useState(0)

  /* 进入后直接拉数据 */
  useEffect(() => {
    if (!active) return
    let alive = true
    ;(async () => {
      setLoading(true)
      const [u, w, d, b] = await Promise.allSettled([
        cks.getAiUsage(),
        cks.getWorkload(),
        cks.getBossDashboard(),
        cks.listBroadcasts(),
      ])
      if (!alive) return
      const es: string[] = []
      if (u.status === 'fulfilled') setUsage(u.value)
      else es.push(`AI用量:${u.reason}`)
      if (w.status === 'fulfilled') setWorkload(w.value)
      else es.push(`工作量:${w.reason}`)
      if (d.status === 'fulfilled') setDash(d.value)
      else es.push(`大盘:${d.reason}`)
      if (b.status === 'fulfilled') setBroadcasts(b.value)
      else es.push(`通知:${b.reason}`)
      setErrs(es)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [active, dataVer])

  /* 日历:里程碑单源前端聚合(每项目一请求;项目多/慢时已批降级路径就是本形态) */
  useEffect(() => {
    if (!active || projectIds.length === 0) return
    let alive = true
    ;(async () => {
      const settled = await Promise.allSettled(
        projectIds.slice(0, 8).map((pid) => cks.listMilestones(pid).then((ms) => ({ pid, ms }))),
      )
      if (!alive) return
      const evs: CalendarEvent[] = []
      let failed = 0
      settled.forEach((r, idx) => {
        if (r.status !== 'fulfilled') { failed += 1; return }
        for (const m of r.value.ms) {
          /* 里程碑 due 是自然语言(今日/周五前),只收 YYYY-MM-DD 形款进日历,其余不硬编日期(不伪造) */
          const m2 = m.due.match(/(\d{4})-(\d{2})-(\d{2})/)
          if (m2) evs.push({ date: m2[0], label: m.title.slice(0, 24), projIdx: idx })
        }
      })
      setCalErr(failed > 0 ? `日历:${failed} 个项目的里程碑加载失败` : '')
      setCalEvents(evs)
    })()
    return () => {
      alive = false
    }
  }, [active, projectIds, dataVer])

  const sendBroadcast = useCallback(async (text: string) => {
    await cks.createBroadcast(text)
    setDataVer((v) => v + 1)
    /* 通知类数据变更 → 专属事件,协作板横幅(useHubLive)监听重拉(一类数据一事件) */
    window.dispatchEvent(new CustomEvent('romai:broadcast-updated'))
  }, [])

  const allErrs = [...errs, ...(calErr ? [calErr] : [])]
  return {
    gate: 'open', loading, usage, workload, dash, broadcasts, calEvents,
    err: allErrs.length ? `部分数据加载失败——${allErrs.join(' / ')}` : null,
    sendBroadcast,
    reload: () => setDataVer((v) => v + 1),
  }
}

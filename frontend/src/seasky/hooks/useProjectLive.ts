import { useEffect, useState } from 'react'

import type { ProjectMilestone, ProjectOverview, ProjectProgress, ProjectRisk } from '@/types/schemas'

import { projectService as ps } from '../services'

/* b0 项目中心真源聚合:overview/progress/milestones/risks/研判摘要,随项目切换重拉。
   各请求独立失败不互相拖垮;三态如实。 */

export interface ProjectLive {
  loading: boolean
  err: string | null
  overview: ProjectOverview | null
  progress: ProjectProgress | null
  milestones: ProjectMilestone[]
  risks: ProjectRisk[]
  analysisLead: string | null /* 最新研判一句话(总览优先) */
}

export function useProjectLive(active: boolean, projectId: number | null): ProjectLive {
  const [state, setState] = useState<ProjectLive>({
    loading: true, err: null, overview: null, progress: null, milestones: [], risks: [], analysisLead: null,
  })

  useEffect(() => {
    if (!active || projectId == null) return
    let alive = true
    setState((s) => ({ ...s, loading: true, err: null }))
    ;(async () => {
      const [ov, pg, ms, rk, an] = await Promise.allSettled([
        ps.overview(projectId),
        ps.progress(projectId),
        ps.milestones(projectId),
        ps.risks(projectId),
        ps.latestAnalyses(projectId),
      ])
      if (!alive) return
      const pick = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null)
      const anList = pick(an) as { items?: { task: string; status: string; content: string }[] } | null
      /* 研判摘要:最新一条 ok 研判的首行(overview 任务优先,无则任意) */
      let lead: string | null = null
      if (anList?.items?.length) {
        const okOnes = anList.items.filter((a) => a.status === 'ok' && a.content)
        const pref = okOnes.find((a) => a.task === 'overview') ?? okOnes[0]
        if (pref) lead = pref.content.split('\n').find((l) => l.trim()) ?? null
      }
      const failed = [ov, pg, ms, rk].filter((r) => r.status === 'rejected').length
      setState({
        loading: false,
        err: failed === 4 ? '项目数据加载失败(后端不可达?)' : null,
        overview: pick(ov),
        progress: pick(pg),
        milestones: (pick(ms) as ProjectMilestone[] | null) ?? [],
        risks: (pick(rk) as ProjectRisk[] | null) ?? [],
        analysisLead: lead,
      })
    })()
    return () => {
      alive = false
    }
  }, [active, projectId])

  return state
}

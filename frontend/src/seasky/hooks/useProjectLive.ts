import { useEffect, useState } from 'react'

import type { ProjectMilestone, ProjectOverview, ProjectProgress, ProjectRisk } from '@/types/schemas'

import { projectService as ps } from '../services'

/* b0 项目中心真源聚合:overview/progress/milestones/risks/研判摘要,随项目切换重拉。
   各请求独立失败不互相拖垮;三态如实。
   封板可信度包(2026-07-08):①无项目时 loading 落地为 false(修"…永挂");
   ②逐源记错——单源失败也如实报(此前只有 4 源全败才报,错误伪装成空态)。 */

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
    if (!active) return
    if (projectId == null) {
      /* 无项目:loading 必须落地,否则数字区永远"…"(空态指引由 ProjectSwitcher 承担) */
      setState({ loading: false, err: null, overview: null, progress: null, milestones: [], risks: [], analysisLead: null })
      return
    }
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
      /* 逐源记错:失败源如实点名(错误≠空库);全败给更重的话 */
      const srcNames = ['总览', '进度', '里程碑', '风险'] as const
      const failedNames = [ov, pg, ms, rk]
        .map((r, i) => (r.status === 'rejected' ? srcNames[i] : null))
        .filter(Boolean) as string[]
      setState({
        loading: false,
        err:
          failedNames.length === 4
            ? '项目数据加载失败(后端不可达?)'
            : failedNames.length > 0
              ? `部分数据加载失败——${failedNames.join('/')}`
              : null,
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

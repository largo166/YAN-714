import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import type { Project } from '@/types/schemas'

import { LS_KEYS } from '../lib/constants'
import { lsGet, lsSet } from '../lib/storage'

/* ═══ 数据桥 · 项目状态(海天正式前端的咽喉,2026-07-06 路线) ═══
   真源:GET /api/projects 列表 + PUT updateProject 改名。
   与紫黑 ProjectContext 同一数据事实(同 api.ts);当前选择持久化 localStorage(海天自己的键)。
   加载/失败三态如实暴露,组件端不许假装有项目。 */

export interface ProjectBridge {
  projects: Project[]
  cur: Project | null
  loading: boolean
  err: string | null
  switchProject: (id: number) => void
  renameProject: (name: string) => Promise<void>
  reload: () => Promise<void>
}

const LS_CUR = LS_KEYS.projects + '_cur_real' /* 真实项目 id 的持久化(与旧 mock 键分开,互不污染) */

export function useProjectBridge(): ProjectBridge {
  const [projects, setProjects] = useState<Project[]>([])
  const [curId, setCurId] = useState<number | null>(() => {
    const raw = lsGet(LS_CUR)
    return raw != null && raw !== '' ? Number(raw) : null
  })
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.listProjects()
      setProjects(d.items)
      setCurId((prev) => {
        const next = prev != null && d.items.some((p) => p.id === prev) ? prev : (d.items[0]?.id ?? null)
        if (next != null) lsSet(LS_CUR, String(next))
        return next
      })
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  /* 入库可能新建项目(romai:projects-updated,CleanupWizard done 时派发)→ 切换器即时可见,
     修「入库完新项目要重启才出现」(封板可信度包,2026-07-08;事件命名约定:一类数据一事件)。 */
  useEffect(() => {
    const onProjects = () => void reload()
    window.addEventListener('romai:projects-updated', onProjects)
    return () => window.removeEventListener('romai:projects-updated', onProjects)
  }, [reload])

  const switchProject = useCallback((id: number) => {
    setCurId(id)
    lsSet(LS_CUR, String(id))
  }, [])

  const renameProject = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || curId == null) return
      /* 真改名:PUT /api/projects/{id};成功后本地同步,失败抛给调用方如实呈现 */
      const updated = await api.updateProject(curId, { name: trimmed })
      setProjects((ps) => ps.map((p) => (p.id === curId ? updated : p)))
    },
    [curId],
  )

  const cur = useMemo(() => projects.find((p) => p.id === curId) ?? null, [projects, curId])

  return { projects, cur, loading, err, switchProject, renameProject, reload }
}

/** 阶段 key→中文标签(与紫黑 16 节点口径一致;b0 阶段带用) */
export const STAGE_LABELS: Record<string, string> = {
  brief: '任务书', condition: '条件梳理', site: '场地研究', user_function: '使用者功能',
  case_study: '案例研究', core_issue: '核心问题', concept: '概念生成', space_strategy: '空间策略',
  massing: '体量推演', circulation: '动线组织', plan_section: '平剖立', comparison: '方案比选',
  drawing: '图面表达', narrative: '汇报叙事', review: '评图反馈', archive: '复盘入库',
}
export const STAGE_ORDER = Object.keys(STAGE_LABELS)

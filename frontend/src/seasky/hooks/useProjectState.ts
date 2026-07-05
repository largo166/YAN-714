import { useCallback, useMemo, useState } from 'react'

import { LS_KEYS } from '../lib/constants'
import { lsGetJSON, lsSetJSON } from '../lib/storage'
import { PROJECTS_SEED, type Project } from '../data/projects.mock'

interface PersistShape {
  names: string[]
  cur: number
}

function restore(): { projects: Project[]; cur: number } {
  const projects = PROJECTS_SEED.map((p) => ({ ...p }))
  let cur = 0
  const saved = lsGetJSON<PersistShape>(LS_KEYS.projects)
  if (saved) {
    if (Array.isArray(saved.names)) {
      saved.names.forEach((n, i) => {
        if (n && projects[i]) projects[i].name = n
      })
    }
    if (typeof saved.cur === 'number' && projects[saved.cur]) cur = saved.cur
  }
  return { projects, cur }
}

/** 项目数据层:切换/改名 + localStorage 持久化(键与原型同名,既有记忆无缝延续) */
export function useProjectState() {
  const [{ projects, cur }, setState] = useState(restore)

  const persist = useCallback((ps: Project[], c: number) => {
    lsSetJSON(LS_KEYS.projects, { names: ps.map((p) => p.name), cur: c } satisfies PersistShape)
  }, [])

  const switchProject = useCallback(
    (i: number) => {
      setState((s) => {
        if (i === s.cur || !s.projects[i]) return s
        persist(s.projects, i)
        return { ...s, cur: i }
      })
    },
    [persist],
  )

  const renameProject = useCallback(
    (name: string) => {
      setState((s) => {
        const trimmed = name.trim()
        if (!trimmed) return s
        const projects = s.projects.map((p, i) => (i === s.cur ? { ...p, name: trimmed } : p))
        persist(projects, s.cur)
        return { ...s, projects }
      })
    },
    [persist],
  )

  const current = useMemo(() => projects[cur], [projects, cur])
  return { projects, cur, current, switchProject, renameProject }
}

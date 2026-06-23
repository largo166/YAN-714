import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api } from '@/lib/api'
import type { Project } from '@/types/schemas'

import { ProjectContext } from './useProject'

/** 三板块共享「当前项目」：项目中心选中 → 共创营地「作用于」/ 数据基地「效果图范围」跟随。
 *  轻量 React Context，非全局状态管理重构（不引 Zustand/React Query，遵守总纲 §2）。 */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [curId, setCurId] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const reload = useCallback(() => {
    api
      .listProjects()
      .then((d) => {
        setProjects(d.items)
        // 仅在尚未选中（或选中项已不存在）时回落到首个项目，避免覆盖用户选择
        setCurId((prev) =>
          prev != null && d.items.some((p) => p.id === prev) ? prev : (d.items[0]?.id ?? null),
        )
      })
      .catch((e: Error) => setErr(e.message))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const cur = useMemo(() => projects.find((p) => p.id === curId) ?? null, [projects, curId])

  const value = useMemo(
    () => ({ projects, curId, setCurId, cur, err, reload }),
    [projects, curId, cur, err, reload],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

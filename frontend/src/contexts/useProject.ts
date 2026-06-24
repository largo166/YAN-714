import { createContext, useContext } from 'react'

import type { Project } from '@/types/schemas'

export interface ProjectCtx {
  projects: Project[]
  curId: number | null
  setCurId: (id: number | null) => void
  cur: Project | null
  err: string | null
  reload: () => Promise<void>
}

export const ProjectContext = createContext<ProjectCtx | null>(null)

export function useProject(): ProjectCtx {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject 必须在 ProjectProvider 内使用')
  return ctx
}

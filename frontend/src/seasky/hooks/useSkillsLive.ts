import { useEffect, useMemo, useState } from 'react'

import type { Skill } from '@/types/schemas'

import { campService as cs } from '../services'

/* b2 技能目录真源:GET /api/skills(22 项,5 类),分类分组供技能库/快捷卡 */

const CAT_ORDER = ['概念与方案', '竞品与研究', '文本与汇报', '出图与表现', '审查与合规']

export interface SkillsLive {
  loading: boolean
  err: string | null
  skills: Skill[]
  byId: Record<string, Skill>
  cats: [string, Skill[]][]
}

export function useSkillsLive(active: boolean): SkillsLive {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!active || loaded) return
    let alive = true
    cs.listSkills()
      .then((d) => {
        if (!alive) return
        setSkills(d.items)
        setErr(null)
        setLoaded(true)
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [active, loaded])

  const byId = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])) as Record<string, Skill>, [skills])
  const cats = useMemo(() => {
    const m = new Map<string, Skill[]>()
    for (const s of skills) {
      const k = s.category || '其它'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()].sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0]))
  }, [skills])

  return { loading, err, skills, byId, cats }
}

import { useEffect, useMemo, useRef, useState } from 'react'

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
  reload: () => void
}

export function useSkillsLive(active: boolean): SkillsLive {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  /* ver 驱动重试(B④):reload() bump ver → 强制重拉,即便首载失败也生效。
     fetchedVer 记住已拉过的 ver,使 active 反复切换不重复请求(进出板不抖),仅 ver 变化才重拉。 */
  const [ver, setVer] = useState(0)
  const fetchedVer = useRef(-1)

  useEffect(() => {
    if (!active || fetchedVer.current === ver) return
    fetchedVer.current = ver
    let alive = true
    setLoading(true)
    setErr(null)
    cs.listSkills()
      .then((d) => {
        if (!alive) return
        setSkills(d.items)
        setErr(null)
      })
      .catch((e) => {
        if (!alive) return
        setErr((e as Error).message)
        fetchedVer.current = -1 /* 失败不锁定:下次 active 或 reload 可再试 */
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [active, ver])

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

  return { loading, err, skills, byId, cats, reload: () => setVer((v) => v + 1) }
}

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import BriefCognitionCard from './BriefCognitionCard'

type ModuleMeta = { module: string; label: string; implemented: boolean }

/** 项目结构化认知区（A1-A8）：模块标签页 + 当前模块的分档认知卡。
 *  默认进任务书(brief)；其余 A2-A8 同一套抽取/确认/注入逻辑。 */
export default function CognitionSection({ projectId }: { projectId: number | null }) {
  const [mods, setMods] = useState<ModuleMeta[]>([])
  const [active, setActive] = useState('brief')

  useEffect(() => {
    if (projectId == null) {
      setMods([])
      return
    }
    api
      .listCognitionModules(projectId)
      .then((m) => setMods(m.filter((x) => x.implemented)))
      .catch(() => setMods([]))
  }, [projectId])

  if (projectId == null) return null

  const activeLabel = mods.find((m) => m.module === active)?.label ?? '任务书'

  return (
    <div className="mt">
      {mods.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 2 }}>
          {mods.map((m) => (
            <button
              key={m.module}
              className={'anbtn' + (m.module === active ? ' on' : '')}
              style={
                m.module === active
                  ? { background: 'var(--terra)', color: '#fff', fontSize: 12 }
                  : { fontSize: 12 }
              }
              onClick={() => setActive(m.module)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {/* key 强制切模块时重挂载,避免上一模块状态残留 */}
      <BriefCognitionCard key={active} projectId={projectId} module={active} label={activeLabel} />
    </div>
  )
}

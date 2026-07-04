import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import BriefCognitionCard from './BriefCognitionCard'

type ModuleMeta = { module: string; label: string; implemented: boolean }

/** 项目结构化认知区（A1-A8）：模块标签页 + 当前模块的分档认知卡。
 *  顶部「AI 解读」总按钮:点一次串行跑全部模块(跳过已生成、显示 N/总 进度、不伪造)。 */
export default function CognitionSection({ projectId }: { projectId: number | null }) {
  const [mods, setMods] = useState<ModuleMeta[]>([])
  const [active, setActive] = useState('brief')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<string | null>(null) // 进度/结果提示
  const [refreshKey, setRefreshKey] = useState(0)                // 批量跑完后强制刷新可见卡

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

  /** 一键 AI 解读:串行跑全部模块,跳过已生成,AI未配置整批停,无材料/失败跳过继续。 */
  const runAll = async () => {
    if (projectId == null || running || mods.length === 0) return
    setRunning(true)
    setProgress('准备解读…')
    try {
      // 已有结果的模块跳过(不覆盖可能已人工确认的内容)
      const existing = new Set((await api.listCognition(projectId)).map((c) => c.module))
      const todo = mods.filter((m) => !existing.has(m.module))
      if (todo.length === 0) {
        setProgress('全部模块均已解读;如需重做,进对应标签点「重新解读」。')
        return
      }
      let done = 0
      let skipped = 0
      for (let i = 0; i < todo.length; i++) {
        const m = todo[i]
        setProgress(`正在解读 ${i + 1}/${todo.length} · ${m.label}…`)
        try {
          const r = await api.extractModule(projectId, m.module)
          if (r.status === 'ok') {
            done++
          } else if (r.status === 'not_configured') {
            // 没 key 再跑也都一样,整批停下如实提示
            setProgress('AI 未配置,请到设置页配置 DeepSeek API Key 后再解读(不会伪造)。')
            return
          } else {
            // no_material / error:该模块跳过,继续下一个(不伪造)
            skipped++
          }
        } catch {
          skipped++
        }
      }
      setRefreshKey((k) => k + 1) // 刷新当前可见卡
      setProgress(
        `解读完成:成功 ${done} 个${skipped ? ` · 跳过 ${skipped} 个(无可用材料/失败)` : ''}` +
          `${existing.size ? ` · 已存在 ${existing.size} 个未动` : ''}。切换上方标签查看各模块。`,
      )
    } finally {
      setRunning(false)
    }
  }

  if (projectId == null) return null

  const activeLabel = mods.find((m) => m.module === active)?.label ?? '任务书'

  return (
    <div className="mt">
      {mods.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 2, alignItems: 'center' }}>
          {mods.map((m) => (
            <button
              key={m.module}
              className={'anbtn' + (m.module === active ? ' on' : '')}
              style={
                m.module === active
                  ? { background: 'rgba(124,92,255,.14)', border: '1px solid rgba(124,92,255,.45)', color: '#cfc6ff', fontSize: 12 }
                  : { fontSize: 12 }
              }
              onClick={() => setActive(m.module)}
            >
              {m.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {/* 一键解读全部模块:点一次跑完整行,不必逐个切 tab 单独点 */}
          <button
            className="btn"
            disabled={running}
            onClick={runAll}
            title="对全部认知模块依次 AI 解读(跳过已生成)"
          >
            {running ? '解读中…' : '✦ AI 解读'}
          </button>
        </div>
      )}
      {progress && (
        <div style={{ fontSize: 12, color: running ? 'var(--terra)' : 'var(--mut)', margin: '4px 2px' }}>{progress}</div>
      )}
      {/* key 含 refreshKey:批量跑完后强制重挂当前卡,拉取最新认知 */}
      <BriefCognitionCard key={`${active}-${refreshKey}`} projectId={projectId} module={active} label={activeLabel} />
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import RichText, { Foldable, JudgmentView, coreLine, parseJudgment, renderInline } from '@/components/RichText'
import { ANALYSIS_TASKS, type AnalysisTaskKey, type ProjectAnalysis } from '@/types/schemas'

const STATUS_HINT: Record<string, { text: string; cls: string }> = {
  ok: { text: '已生成', cls: 'live' },
  not_configured: { text: 'AI 未配置', cls: 'demo' },
  no_material: { text: '暂无材料', cls: 'demo' },
  error: { text: '调用失败', cls: 'fail' },
}

function taskLabel(key: string): string {
  return ANALYSIS_TASKS.find((t) => t.key === key)?.label ?? key
}

/** 4D 研判域:tab 切换=显示该任务已生成结果(秒显不重跑);
 *  「前期分析」总按钮串行跑全部(缓存快路、显进度、跳过已生成);每 tab 可「重新生成」(force)。 */
export default function ProjectAnalysisPanel({ projectId }: { projectId: number | null }) {
  const [active, setActive] = useState<AnalysisTaskKey>('overview')
  const [byTask, setByTask] = useState<Record<string, ProjectAnalysis>>({}) // 各 task 最新结果缓存
  const [runningTask, setRunningTask] = useState<string | null>(null)        // 单任务重新生成中
  const [batchRunning, setBatchRunning] = useState(false)                    // 前期分析(全部)进行中
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reflowNote, setReflowNote] = useState<string | null>(null)
  const [reflowing, setReflowing] = useState(false)

  // 进页面/切项目:批量回填已生成结果(点 tab 秒显,不触发生成)
  const backfill = useCallback(() => {
    if (projectId == null) return
    api
      .latestAnalyses(projectId)
      .then((d) => {
        const map: Record<string, ProjectAnalysis> = {}
        for (const a of d.items) map[a.task] = a
        setByTask(map)
      })
      .catch((e: Error) => setErr(e.message))
  }, [projectId])

  useEffect(() => {
    setByTask({})
    setErr(null)
    setReflowNote(null)
    setProgress(null)
    setActive('overview')
    backfill()
  }, [backfill])

  const current = byTask[active] ?? null

  /** 重新生成当前任务(force=true,真重跑)。 */
  const regenerate = async (task: AnalysisTaskKey) => {
    if (projectId == null || runningTask || batchRunning) return
    setErr(null)
    setReflowNote(null)
    setRunningTask(task)
    try {
      const r = await api.analyzeProject(projectId, task, { force: true })
      setByTask((m) => ({ ...m, [task]: r }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunningTask(null)
    }
  }

  /** 前期分析:串行跑全部任务(缓存快路=已生成秒回、没有的才真生成),显进度、如实跳过。 */
  const runAll = async () => {
    if (projectId == null || batchRunning) return
    setBatchRunning(true)
    setErr(null)
    setReflowNote(null)
    try {
      let done = 0
      let skipped = 0
      for (let i = 0; i < ANALYSIS_TASKS.length; i++) {
        const t = ANALYSIS_TASKS[i]
        setProgress(`正在分析 ${i + 1}/${ANALYSIS_TASKS.length} · ${t.label}…`)
        try {
          const r = await api.analyzeProject(projectId, t.key) // 默认 force=false:命中缓存秒回
          setByTask((m) => ({ ...m, [t.key]: r }))
          if (r.status === 'ok') done++
          else if (r.status === 'not_configured') {
            setProgress('尚未配置 AI 引擎。到「设置」填入 DeepSeek API Key 后即可一键研判。')
            return
          } else skipped++ // no_material / error:如实跳过,继续下一个
        } catch {
          skipped++
        }
      }
      setProgress(`分析完成:成功 ${done} 个${skipped ? ` · 跳过 ${skipped} 个(无材料/失败)` : ''}。切换标签查看各项。`)
    } finally {
      setBatchRunning(false)
    }
  }

  const reflow = async () => {
    if (!current || current.status !== 'ok' || reflowing) return
    setReflowing(true)
    setReflowNote(null)
    try {
      const r = await api.reflowAnalysis(current.id)
      if (r.status === 'ok') setReflowNote(`已回流到数据基地：${r.title}（可被其它项目检索复用）`)
      else if (r.status === 'already') setReflowNote('该研判已回流，未重复写入。')
      else if (r.status === 'not_confirmed') setReflowNote(r.message || '该研判还没有有效结论，暂时不能回流入库。')
      else if (r.status === 'empty') setReflowNote(r.message || '无可回流内容。')
      else setReflowNote(r.message || '无法回流')
    } catch (e) {
      setReflowNote((e as Error).message)
    } finally {
      setReflowing(false)
    }
  }

  return (
    <div className="card mt">
      {/* tab 行 + 前期分析总按钮 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {ANALYSIS_TASKS.map((t) => (
          <button
            key={t.key}
            className={'anbtn' + (active === t.key ? ' on' : '')}
            style={active === t.key ? { background: 'rgba(124,92,255,.14)', border: '1px solid rgba(124,92,255,.45)', color: '#cfc6ff' } : undefined}
            disabled={projectId == null}
            onClick={() => { setActive(t.key); setReflowNote(null) }}
          >
            {t.label}
            {byTask[t.key]?.status === 'ok' ? ' ✓' : ''}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          className="btn"
          disabled={projectId == null || batchRunning}
          onClick={runAll}
          title="对全部任务依次分析(已生成的秒回、没有的才生成)"
        >
          {batchRunning ? '分析中…' : '✦ 前期分析'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 8 }}>
        研判基于「本项目已解析文件 + 知识库检索」生成，每条结论都带出处。
      </div>
      {progress && (
        <div style={{ fontSize: 12, color: batchRunning ? 'var(--terra)' : 'var(--mut)', marginBottom: 8 }}>{progress}</div>
      )}
      {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}

      {/* 当前 tab 的研判结果(来自缓存,秒显) */}
      {current ? (
        <div style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>
              {taskLabel(current.task)}{' '}
              <span className={'statpill ' + (STATUS_HINT[current.status]?.cls ?? 'demo')}>
                {STATUS_HINT[current.status]?.text ?? current.status}
              </span>
            </b>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="anbtn" disabled={runningTask === active || batchRunning} onClick={() => regenerate(active)}
                      title="忽略缓存,重新调用 AI 生成">
                {runningTask === active ? '生成中…' : '重新生成'}
              </button>
              {current.status === 'ok' && (
                <>
                  <button className="anbtn" disabled={reflowing} onClick={reflow} title="把这次研判结论回写数据基地,供其它项目检索复用">
                    {reflowing ? '回流中…' : '回流入库'}
                  </button>
                  <a className="anbtn" href={api.analysisExportUrl(projectId as number, current.id)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                    导出 MD
                  </a>
                </>
              )}
            </div>
          </div>

          {reflowNote && <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 8 }}>{reflowNote}</div>}

          {/* 研判正文：结构化判断优先(核心判断/关键要点/下一步/待确认)；
              无结构化(回落纯文本/旧记录)→ 清洗 markdown 渲染,长文核心优先+折叠 */}
          {(() => {
            const j = current.status === 'ok' ? parseJudgment(current.output_json) : null
            if (j) return <JudgmentView j={j} />
            return (current.content || '').length > 220 ? (
              <Foldable
                summary={<div className="rom-core">{renderInline(coreLine(current.content))}</div>}
                openLabel="展开完整研判"
                closeLabel="收起完整研判"
              >
                <RichText text={current.content} />
              </Foldable>
            ) : (
              <RichText text={current.content} />
            )
          })()}

          {current.status === 'ok' && current.sources.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px dashed var(--line2)', paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mut)', marginBottom: 6 }}>出处（{current.sources.length}）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {current.sources.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--mut)' }}>
                    <span className="pill l" style={{ marginRight: 6 }}>{s.kind === 'project_file' ? '项目文件' : '知识库'}</span>
                    《{s.title}》 — {s.snippet}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ border: '1px dashed var(--line2)', borderRadius: 8, padding: '14px', fontSize: 13, color: 'var(--mut)' }}>
          「{taskLabel(active)}」尚未生成。点上方「✦ 前期分析」一次生成全部,或点
          <button className="anbtn" disabled={projectId == null || runningTask === active || batchRunning} onClick={() => regenerate(active)} style={{ margin: '0 6px' }}>
            {runningTask === active ? '生成中…' : '单独生成本项'}
          </button>
          。
        </div>
      )}
    </div>
  )
}

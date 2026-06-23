import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
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

/** 4D 研判域：5 任务 + 三态 + 结构化出处 + 导出 MD。结论与出处分离展示。 */
export default function ProjectAnalysisPanel({ projectId }: { projectId: number | null }) {
  const [running, setRunning] = useState<string | null>(null)
  const [current, setCurrent] = useState<ProjectAnalysis | null>(null)
  const [history, setHistory] = useState<ProjectAnalysis[]>([])
  const [err, setErr] = useState<string | null>(null)

  const reloadHistory = useCallback(() => {
    if (projectId == null) return
    api
      .listProjectAnalyses(projectId)
      .then((d) => setHistory(d.items))
      .catch((e: Error) => setErr(e.message))
  }, [projectId])

  useEffect(() => {
    setCurrent(null)
    setHistory([])
    setErr(null)
    reloadHistory()
  }, [reloadHistory])

  const run = async (task: AnalysisTaskKey) => {
    if (projectId == null) return
    setErr(null)
    setRunning(task)
    try {
      const r = await api.analyzeProject(projectId, task)
      setCurrent(r)
      reloadHistory()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="card mt">
      <div className="ct">
        AI 智能研判 <span className="statpill live">已接入</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {ANALYSIS_TASKS.map((t) => (
          <button
            key={t.key}
            className={'anbtn' + (current?.task === t.key ? ' on' : '')}
            disabled={projectId == null || running !== null}
            onClick={() => run(t.key)}
          >
            {running === t.key ? '研判中…' : t.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 10 }}>
        研判基于「本项目已解析文件 + 知识库检索」生成并带出处；完整段落级溯源将在检索升级（P6）后增强。
      </div>

      {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}

      {/* 当前研判结果 */}
      {current && (
        <div style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>
              {taskLabel(current.task)}{' '}
              <span className={'statpill ' + (STATUS_HINT[current.status]?.cls ?? 'demo')}>
                {STATUS_HINT[current.status]?.text ?? current.status}
              </span>
            </b>
            {current.status === 'ok' && (
              <a
                className="anbtn"
                href={api.analysisExportUrl(projectId as number, current.id)}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'none' }}
              >
                导出 MD
              </a>
            )}
          </div>

          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: 'var(--ink)' }}>
            {current.content}
          </div>

          {/* 出处区块（仅 ok 且有 sources 时） */}
          {current.status === 'ok' && current.sources.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px dashed var(--line2)', paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--mut)', marginBottom: 6 }}>
                出处（{current.sources.length}）
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {current.sources.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--mut)' }}>
                    <span className="pill l" style={{ marginRight: 6 }}>
                      {s.kind === 'project_file' ? '项目文件' : '知识库'}
                    </span>
                    《{s.title}》 — {s.snippet}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 历史（PC-10 雏形） */}
      {history.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 6 }}>分析历史（{history.length}）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.slice(0, 8).map((h) => (
              <button
                key={h.id}
                className="anbtn"
                style={{ textAlign: 'left' }}
                onClick={() => setCurrent(h)}
              >
                {taskLabel(h.task)} · {new Date(h.created_at).toLocaleString()} ·{' '}
                {STATUS_HINT[h.status]?.text ?? h.status}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

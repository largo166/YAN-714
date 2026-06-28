import { useCallback, useEffect, useState } from 'react'

import { api, type TaskAssignment } from '@/lib/api'

const COLS: { key: 'todo' | 'doing' | 'done'; label: string }[] = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' },
]

/** best-effort 过期判定:due 含 YYYY-MM-DD / . / / 才比；解析不出(如"本周/周五前")则不标红,不伪造预测。 */
function isOverdue(due: string, status: string): boolean {
  if (status === 'done' || !due) return false
  const m = due.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (!m) return false
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d < today
}

/** 任务看板(P0-A):会议纪要「确认」后其待办自动落到这里,在此推进状态。 */
export default function TaskBoardPanel({ projectId }: { projectId: number | null }) {
  const [tasks, setTasks] = useState<TaskAssignment[]>([])
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(() => {
    if (projectId == null) {
      setTasks([])
      return
    }
    api.listAssignments(projectId).then((d) => setTasks(d.items)).catch(() => setTasks([]))
  }, [projectId])
  useEffect(() => {
    load()
  }, [load])

  const move = async (id: number, status: 'todo' | 'doing' | 'done') => {
    setBusy(id)
    try {
      await api.updateAssignment(id, status)
      load()
    } catch {
      /* 忽略,保留原态 */
    } finally {
      setBusy(null)
    }
  }

  if (projectId == null) {
    return <div style={{ color: 'var(--mut)', fontSize: 13 }}>请先选择项目。</div>
  }

  return (
    <>
      <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 8 }}>
        会议纪要「确认」后，其待办自动落到此看板；在此推进状态（待办 → 进行中 → 已完成）。有明确日期且过期的标红。
      </div>
      {tasks.length === 0 ? (
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>
          暂无任务。到「会议纪要」生成纪要并点「确认」，其待办会自动出现在这里。
        </div>
      ) : (
        <div className="grid3">
          {COLS.map((col) => {
            const items = tasks.filter((t) => (t.status || 'todo') === col.key)
            return (
              <div className="card" key={col.key}>
                <div className="ct">
                  {col.label}（{items.length}）
                </div>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--mut)', padding: '6px 0' }}>—</div>
                )}
                {items.map((t) => {
                  const over = isOverdue(t.due, t.status)
                  return (
                    <div
                      key={t.id}
                      style={{ border: '1px solid var(--line2)', borderRadius: 8, padding: '8px 10px', marginTop: 6, background: 'var(--panel2)' }}
                    >
                      <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{t.task_title}</div>
                      <div style={{ fontSize: 11, color: over ? 'var(--red)' : 'var(--mut)', marginTop: 3 }}>
                        {t.owner_name && <span>👤 {t.owner_name}　</span>}
                        {t.due && (
                          <span>
                            {over ? '⚠ ' : '⏱ '}
                            {t.due}
                            {over ? '（已过期）' : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        {col.key !== 'todo' && (
                          <button
                            className="anbtn"
                            disabled={busy === t.id}
                            onClick={() => move(t.id, col.key === 'done' ? 'doing' : 'todo')}
                            style={{ fontSize: 11 }}
                          >
                            ← 退回
                          </button>
                        )}
                        {col.key !== 'done' && (
                          <button
                            className="anbtn"
                            disabled={busy === t.id}
                            onClick={() => move(t.id, col.key === 'todo' ? 'doing' : 'done')}
                            style={{ fontSize: 11 }}
                          >
                            {col.key === 'todo' ? '→ 进行中' : '→ 完成'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

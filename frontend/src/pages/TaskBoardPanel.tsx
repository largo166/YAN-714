import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Clock, Snail, User } from 'lucide-react'

import { api, type TaskAssignment } from '@/lib/api'

const COLS: { key: 'todo' | 'doing' | 'done'; label: string }[] = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' },
]

const STALE_DAYS = 7 // 未完成任务放置超过此天数即「卡住」(纯事实:放置时长,非预测)

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

function ageDays(created_at: string): number {
  const t = Date.parse(created_at)
  if (Number.isNaN(t)) return 0
  return Math.floor((Date.now() - t) / 86400000)
}

/** 卡住:未完成 + 放置 ≥ STALE_DAYS 天 + 不是「过期」(过期单独算,不重复计)。 */
function isStale(t: TaskAssignment): boolean {
  return t.status !== 'done' && !isOverdue(t.due, t.status) && ageDays(t.created_at) >= STALE_DAYS
}

/** 任务看板 + 风险提醒(P0-A / P1-G):纪要待办落此,在此推进;过期/卡住给警告徽章(不伪造预测)。
 *  refreshSignal:父级在「纪要确认」后 +1,确认会在后端把待办落成任务,需重拉看板(否则确认完看板还是空的)。 */
export default function TaskBoardPanel({
  projectId,
  onRisk,
  refreshSignal,
}: {
  projectId: number | null
  onRisk?: (counts: { overdue: number; stale: number }) => void
  refreshSignal?: number
}) {
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
  }, [load, refreshSignal])

  const overdueCount = tasks.filter((t) => isOverdue(t.due, t.status)).length
  const staleCount = tasks.filter((t) => isStale(t)).length
  useEffect(() => {
    onRisk?.({ overdue: overdueCount, stale: staleCount })
  }, [overdueCount, staleCount, onRisk])

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
    return <div className="text-muted-foreground text-[13px]">请先选择项目。</div>
  }

  return (
    <>
      <div className="text-[11.5px] text-muted-foreground mb-2">
        会议纪要「确认」后，其待办自动落到此看板；在此推进状态（待办 → 进行中 → 已完成）。有明确日期且过期的标红。
      </div>
      {(overdueCount > 0 || staleCount > 0) && (
        <div className="text-[12px] text-destructive bg-[var(--terra-soft)] border border-solid border-[var(--terra-line)] rounded-[8px] py-[6px] px-[10px] mb-2">
          <AlertTriangle size={13} className="align-[-2px] mr-1" />需关注：
          {overdueCount > 0 && <b>{overdueCount} 项过期</b>}
          {overdueCount > 0 && staleCount > 0 && ' · '}
          {staleCount > 0 && <b>{staleCount} 项卡住（放置 ≥{STALE_DAYS} 天未推进）</b>}
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="text-muted-foreground text-[13px] py-2">
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
                  <div className="text-[12px] text-muted-foreground py-[6px]">—</div>
                )}
                {items.map((t) => {
                  const over = isOverdue(t.due, t.status)
                  return (
                    <div
                      key={t.id}
                      className="border border-solid border-input rounded-[8px] py-2 px-[10px] mt-[6px] bg-popover"
                    >
                      <div className="text-[12.5px] text-foreground">{t.task_title}</div>
                      <div className={`text-[11px] mt-[3px] ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {t.owner_name && (
                          <span><User size={11} className="align-[-1px] mr-[3px]" />{t.owner_name}{'　'}</span>
                        )}
                        {t.due && (
                          <span>
                            {over
                              ? <AlertTriangle size={11} className="align-[-1px] mr-[3px]" />
                              : <Clock size={11} className="align-[-1px] mr-[3px]" />}
                            {t.due}
                            {over ? '（已过期）' : ''}
                          </span>
                        )}
                        {isStale(t) && (
                          <span className="text-primary">{'　'}<Snail size={11} className="align-[-1px] mr-[3px]" />卡住 {ageDays(t.created_at)} 天</span>
                        )}
                      </div>
                      <div className="flex gap-[6px] mt-[6px]">
                        {col.key !== 'todo' && (
                          <button
                            className="anbtn text-[11px]"
                            disabled={busy === t.id}
                            onClick={() => move(t.id, col.key === 'done' ? 'doing' : 'todo')}
                          >
                            ← 退回
                          </button>
                        )}
                        {col.key !== 'done' && (
                          <button
                            className="anbtn text-[11px]"
                            disabled={busy === t.id}
                            onClick={() => move(t.id, col.key === 'todo' ? 'doing' : 'done')}
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

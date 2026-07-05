import { useCallback, useEffect, useState } from 'react'

import type { Meeting, MeetingMinute } from '@/types/schemas'

import { projectService as ps } from '../../services'
import { FlowBtn, FlowCard, FlowTonePill, type CardTone } from './flowKit'

/* b2 · 会议纪要动作卡:listMeetings→选会→getLatestMinute(草案/已审定)→404 显式计费生成。
   口径(已拍):营地只做发起/查看/导出;审定回流深链项目中心(b0)。 */

export function MinuteFlowCard({ projectId, onGoProject }: { projectId: number | null; onGoProject: () => void }) {
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<Meeting | null>(null)
  const [minute, setMinute] = useState<MeetingMinute | null>(null)
  const [minuteMissing, setMinuteMissing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (projectId == null) return
    let alive = true
    ps.listMeetings(projectId)
      .then((d) => alive && setMeetings(d.items))
      .catch((e) => alive && setErr((e as Error).message))
    return () => {
      alive = false
    }
  }, [projectId])

  const pick = useCallback(async (m: Meeting) => {
    if (projectId == null) return
    setSel(m); setMinute(null); setMinuteMissing(false); setErr(''); setBusy(true)
    try {
      setMinute(await ps.getLatestMinute(projectId, m.id))
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('404') || msg.includes('Not Found') || msg.includes('尚未')) setMinuteMissing(true)
      else setErr(msg)
    } finally {
      setBusy(false)
    }
  }, [projectId])

  const generate = useCallback(async () => {
    /* 显式计费触发:只有用户点这个按钮才调 DeepSeek */
    if (projectId == null || !sel) return
    setBusy(true); setErr('')
    try {
      setMinute(await ps.generateMinute(projectId, sel.id))
      setMinuteMissing(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [projectId, sel])

  const tone: CardTone = busy ? 'pending' : err ? 'error' : minute ? (minute.gen_status === 'ok' ? 'ok' : 'neutral') : 'neutral'
  const pillText = busy ? '处理中' : err ? '失败' : minute ? (minute.review_status === 'confirmed' ? '已审定' : minute.gen_status === 'ok' ? '草案' : minute.gen_status) : sel ? '未生成' : '选择会议'

  return (
    <FlowCard icon="✎" title="会议纪要" pill={<FlowTonePill tone={tone} text={pillText} />}>
      {projectId == null && <div className="text-sk-muted">请先选择作用项目。</div>}
      {err && <div className="text-sk-risk">{err}</div>}
      {!sel && meetings && meetings.length === 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-sk-muted">本项目还没有会议。到项目中心创建腾讯会议或粘贴会议记录后,再来生成纪要。</div>
          <div><FlowBtn onClick={onGoProject}>去项目中心 →</FlowBtn></div>
        </div>
      )}
      {!sel && meetings && meetings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11.5px] text-sk-muted2">选择一场会议查看/生成纪要:</div>
          {meetings.slice(0, 5).map((m) => (
            <button
              key={m.id}
              className="cursor-pointer rounded-[9px] border-[0.5px] border-sk-hairsoft bg-transparent p-2 px-2.5 text-left text-[12px] text-[#c9ccd0] transition-colors duration-150 hover:border-[rgba(127,179,207,.4)] hover:text-sk-fg"
              onClick={() => void pick(m)}
            >
              {m.title} <span className="text-sk-muted2">· {m.meeting_date.slice(5, 10)}{m.status === 'confirmed' ? ' · 已确认' : ''}</span>
            </button>
          ))}
        </div>
      )}
      {sel && busy && <div className="text-sk-warn">处理中…</div>}
      {sel && !busy && minuteMissing && (
        <div className="flex flex-col gap-2">
          <div className="text-sk-muted">「{sel.title}」尚未生成纪要。</div>
          <div className="flex items-center gap-2.5">
            <FlowBtn kind="primary" onClick={generate}>生成纪要(调用 DeepSeek · 计费)</FlowBtn>
            <FlowBtn onClick={() => setSel(null)}>换一场</FlowBtn>
          </div>
        </div>
      )}
      {sel && !busy && minute && (
        <div className="flex flex-col gap-2">
          {minute.gen_status === 'ok' ? (
            <>
              {minute.summary.slice(0, 3).map((s, i) => (
                <div key={i} className="text-[12px] text-[#c9ccd0]">· {s}</div>
              ))}
              {minute.todos.length > 0 && <div className="text-[11.5px] text-sk-muted2">待办 {minute.todos.length} 项 · 决策 {minute.decisions.length} 项</div>}
              <div className="flex flex-wrap items-center gap-2.5">
                {projectId != null && (
                  <>
                    <a
                      className="font-skcjk text-[11.5px] text-sk-primary underline-offset-2 hover:underline"
                      href={ps.minuteDocxUrl(projectId, sel.id, minute.id)}
                    >
                      导出 Word(对外)
                    </a>
                    <a
                      className="font-skcjk text-[11.5px] text-sk-primary underline-offset-2 hover:underline"
                      href={ps.minutePrintUrl(projectId, sel.id, minute.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      打印视图
                    </a>
                  </>
                )}
                <FlowBtn onClick={onGoProject}>去项目中心审定/回流 →</FlowBtn>
                <FlowBtn onClick={() => setSel(null)}>换一场</FlowBtn>
              </div>
            </>
          ) : (
            <div className="text-sk-muted">
              {minute.gen_status === 'not_configured' && '尚未配置 AI 引擎(DeepSeek Key),无法生成。'}
              {minute.gen_status === 'no_material' && '这场会议没有可用材料(记录/转写为空)。'}
              {minute.gen_status === 'error' && `生成失败:${minute.error_message}`}
            </div>
          )}
        </div>
      )}
    </FlowCard>
  )
}

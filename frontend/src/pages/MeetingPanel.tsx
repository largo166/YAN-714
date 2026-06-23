import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import type { Meeting, MeetingMinute } from '@/types/schemas'

const GEN_HINT: Record<string, { text: string; cls: string }> = {
  ok: { text: '已生成', cls: 'live' },
  not_configured: { text: 'AI 未配置', cls: 'demo' },
  no_material: { text: '无记录', cls: 'demo' },
  error: { text: '失败', cls: 'fail' },
}
const SEC = ['一、会议背景', '二、关键结论', '三、甲方诉求', '四、风险与分歧', '五、下一步行动']

/** 会议成果交付中心：记录输入(贴文本/上传材料)→五段式→双版→Word/打印导出→可选腾讯会议。 */
export default function MeetingPanel({ projectId }: { projectId: number | null }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [title, setTitle] = useState('')
  const [mDate, setMDate] = useState('')
  const [attendees, setAttendees] = useState('')
  const [rawText, setRawText] = useState('')
  const [curMeeting, setCurMeeting] = useState<number | null>(null)
  const [minute, setMinute] = useState<MeetingMinute | null>(null)
  const [showInternal, setShowInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    if (projectId == null) return
    api.listMeetings(projectId).then((d) => setMeetings(d.items)).catch((e: Error) => setErr(e.message))
  }, [projectId])

  useEffect(() => {
    setMeetings([])
    setCurMeeting(null)
    setMinute(null)
    setErr(null)
    setMsg(null)
    reload()
  }, [reload])

  const create = async () => {
    if (projectId == null || !rawText.trim()) return
    setBusy(true)
    setErr(null)
    try {
      const m = await api.createMeeting(projectId, {
        title: title || '未命名会议', meeting_date: mDate, attendees, raw_text: rawText,
      })
      setRawText('')
      setCurMeeting(m.id)
      setMinute(null)
      reload()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const uploadMaterial = async (file: File) => {
    if (projectId == null) return
    setBusy(true)
    setErr(null)
    try {
      const m = await api.createMeetingFromMaterial(projectId, file, {
        title: title || file.name, meeting_date: mDate, attendees,
      })
      setCurMeeting(m.id)
      setMinute(null)
      reload()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const genMinute = async (mid: number) => {
    if (projectId == null) return
    setBusy(true)
    setErr(null)
    setCurMeeting(mid)
    try {
      setMinute(await api.generateMinute(projectId, mid))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    if (projectId == null || curMeeting == null || !minute) return
    try {
      setMinute(await api.confirmMinute(projectId, curMeeting, minute.id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const reflow = async () => {
    if (projectId == null || curMeeting == null || !minute) return
    try {
      const r = await api.reflowMinute(projectId, curMeeting, minute.id)
      if (r.status === 'ok') setMinute({ ...minute, reflowed: true })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  // 语音播报：用 confirmed 纪要的真实五段内容拼播报稿，浏览器 speechSynthesis 朗读（无后端/无 key/离线）。
  const buildScript = (m: MeetingMinute): string => {
    const parts: string[] = ['以下是会议纪要要点播报。']
    if (m.summary.length) parts.push('纪要内容：' + m.summary.join('；') + '。')
    if (m.core_items.length) parts.push('核心事项：' + m.core_items.join('；') + '。')
    if (m.decisions.length) parts.push('会议决议：' + m.decisions.join('；') + '。')
    if (m.todos.length)
      parts.push(
        '待办事项：' +
          m.todos.map((t) => t.text + (t.owner ? '，负责人' + t.owner : '')).join('；') +
          '。',
      )
    parts.push('播报结束。')
    return parts.join('')
  }

  const toggleSpeak = () => {
    if (!minute) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setErr('当前浏览器不支持语音播报。')
      return
    }
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(buildScript(minute))
    u.lang = 'zh-CN'
    u.rate = 1
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(u)
  }

  // 切换纪要 / 卸载时停止播报，避免串音
  useEffect(() => {
    setSpeaking(false)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [minute?.id])

  if (projectId == null) {
    return (
      <div className="card mt">
        <div className="ct">会议成果交付中心</div>
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>请先选择一个项目。</div>
      </div>
    )
  }

  const demands = minute ? (showInternal ? minute.demand_internal : minute.demand_external) : []
  const openPrint = (internal: boolean) => {
    if (curMeeting == null || !minute) return
    window.open(api.minutePrintUrl(projectId, curMeeting, minute.id, internal), '_blank')
  }

  return (
    <div className="card mt">
      <div className="ct">
        会议成果交付中心 <span className="statpill live">已接入</span>
      </div>

      {/* 会议记录输入 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input className="ipt" placeholder="会议主题" value={title} onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 2, padding: '8px 10px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13 }} />
        <input className="ipt" placeholder="日期" value={mDate} onChange={(e) => setMDate(e.target.value)}
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13 }} />
      </div>
      <input className="ipt" placeholder="参会人（逗号分隔）" value={attendees} onChange={(e) => setAttendees(e.target.value)}
        style={{ width: '100%', marginBottom: 6, padding: '8px 10px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13 }} />
      <textarea placeholder="粘贴会议记录文本（或下方上传 txt/md/docx/pdf 材料）" value={rawText}
        onChange={(e) => setRawText(e.target.value)} rows={4}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13, resize: 'vertical' }} />
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy || !rawText.trim()} onClick={create}>创建会议</button>
        <button className="anbtn" disabled={busy} onClick={() => fileRef.current?.click()}>上传材料</button>
        <input ref={fileRef} type="file" accept=".txt,.md,.docx,.pdf" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) uploadMaterial(e.target.files[0]); e.target.value = '' }} />
      </div>

      {msg && <div style={{ color: 'var(--ok)', fontSize: 12.5, marginTop: 8 }}>{msg}</div>}
      {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{err}</div>}

      {/* 会议列表 */}
      {meetings.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {meetings.map((m) => (
            <div key={m.id} style={{ padding: '8px 10px', border: '1px solid var(--line2)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 13 }}>
                  🗓 {m.title}
                  <span style={{ fontSize: 11, color: 'var(--mut)' }}> · {new Date(m.created_at).toLocaleString()}</span>
                  {m.tencent_meeting_code && (
                    <span className="statpill live" style={{ marginLeft: 6 }}>腾讯 {m.tencent_meeting_code}</span>
                  )}
                </div>
                <button className="anbtn" disabled={busy} onClick={() => genMinute(m.id)}>生成纪要</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 纪要五段 */}
      {minute && (
        <div style={{ marginTop: 12, border: '1px solid var(--line2)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b style={{ fontSize: 14 }}>
              五段式纪要{' '}
              <span className={'statpill ' + (GEN_HINT[minute.gen_status]?.cls ?? 'demo')}>
                {GEN_HINT[minute.gen_status]?.text ?? minute.gen_status}
              </span>
              <span className={'statpill ' + (minute.review_status === 'confirmed' ? 'live' : 'demo')}>
                {minute.review_status === 'confirmed' ? '已审定' : '草案'}
              </span>
            </b>
            {minute.gen_status === 'ok' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="anbtn" onClick={toggleSpeak} title="用浏览器语音朗读纪要要点">
                  {speaking ? '■ 停止播报' : '🔊 语音播报'}
                </button>
                {minute.review_status !== 'confirmed' && <button className="anbtn" onClick={confirm}>人工审定</button>}
                {minute.review_status === 'confirmed' &&
                  (minute.reflowed ? (
                    <span className="statpill live">✓ 已回流下一步</span>
                  ) : (
                    <button className="anbtn" onClick={reflow} title="把已审定纪要待办回流为项目中心「下一步·里程碑」">
                      回流到下一步
                    </button>
                  ))}
                <a className="anbtn" style={{ textDecoration: 'none' }}
                   href={api.minuteDocxUrl(projectId, curMeeting as number, minute.id, 'external')}>导出 Word(对外)</a>
                <a className="anbtn" style={{ textDecoration: 'none' }}
                   href={api.minuteDocxUrl(projectId, curMeeting as number, minute.id, 'internal')}>导出 Word(对内)</a>
                <button className="anbtn" onClick={() => openPrint(false)}>打印 / 保存 PDF</button>
              </div>
            )}
          </div>

          {minute.gen_status !== 'ok' ? (
            <div style={{ color: 'var(--mut)', fontSize: 13 }}>
              {minute.gen_status === 'not_configured' && '未配置 AI Key，无法生成纪要（不伪造）。请在设置中配置后重试。'}
              {minute.gen_status === 'no_material' && '会议记录为空，无法生成纪要。请先粘贴记录或上传材料。'}
              {minute.gen_status === 'error' && `生成失败：${minute.error_message}`}
            </div>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <Section title={SEC[0]} items={minute.summary} />
              <Section title={SEC[1]} items={minute.core_items} />

              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <b>{SEC[2]}</b>
                <button className={'anbtn' + (!showInternal ? ' on' : '')} onClick={() => setShowInternal(false)}>对外纪要版</button>
                <button className={'anbtn' + (showInternal ? ' on' : '')} onClick={() => setShowInternal(true)}>对内研判版</button>
              </div>
              <div style={{ marginTop: 4 }}>
                {demands.map((d, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    • {d.statement}
                    {d.quote && <span style={{ fontSize: 11, color: 'var(--mut)' }}> （原话「{d.quote}」 {d.time}）</span>}
                  </div>
                ))}
              </div>

              <Section title={SEC[3]} items={minute.decisions} top />
              <div style={{ marginTop: 8 }}>
                <b>{SEC[4]}</b>
                {minute.todos.map((t, i) => (
                  <div key={i}>
                    ☐ {t.text}
                    {t.owner && <span style={{ color: 'var(--mut)' }}> @{t.owner}</span>}
                    {t.due && <span style={{ color: 'var(--mut)' }}>（{t.due}）</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, items, top }: { title: string; items: string[]; top?: boolean }) {
  return (
    <div style={{ marginTop: top ? 8 : 4 }}>
      <b>{title}</b>
      {items.map((x, i) => (
        <div key={i}>• {x}</div>
      ))}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'

import { Video } from 'lucide-react'

import { api } from '@/lib/api'
import type { Meeting } from '@/types/schemas'

const SYNC_HINT: Record<string, string> = {
  ok: '已同步腾讯纪要',
  transcript_pending: '智能纪要未生成，仅同步到转写',
  no_recording: '该会议暂无录制/转写',
  not_configured: '腾讯会议未配置',
  provider_unavailable: '腾讯服务暂不可用',
}

/** 一键创建腾讯会议卡（零输入）：建会议→显示会议号/链接(可复制)→会后同步纪要。 */
export default function TencentMeetingCard({ projectId }: { projectId: number | null }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (projectId == null) return
    api
      .listMeetings(projectId)
      .then((d) => setMeetings(d.items.filter((m) => m.provider === 'tencent' && m.tencent_join_url)))
      .catch((e: Error) => setErr(e.message))
  }, [projectId])

  useEffect(() => {
    setMeetings([])
    setErr(null)
    setMsg(null)
    reload()
  }, [reload])

  const createOne = async () => {
    if (projectId == null) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const m = await api.quickTencentMeeting(projectId)
      setMsg(`已创建腾讯会议 · 会议号 ${m.tencent_meeting_code}`)
      reload()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => setMsg('已复制入会链接'),
      () => setMsg('复制失败，请手动选择'),
    )
  }

  const sync = async (mid: number) => {
    if (projectId == null) return
    setBusy(true)
    setErr(null)
    try {
      const r = await api.syncTencentMinutes(projectId, mid)
      setMsg(SYNC_HINT[r.status] ?? r.status)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (projectId == null) {
    return (
      <div className="card mt">
        <div className="ct">腾讯会议</div>
        <div className="text-muted-foreground text-[13px] py-2">请先选择一个项目。</div>
      </div>
    )
  }

  return (
    <div className="card mt">
      <div className="ct">
        腾讯会议 <span className="statpill live">一键创建</span>
      </div>
      <div className="text-[12px] text-muted-foreground mb-2">
        一键创建真实腾讯会议，自动生成会议号与入会链接（未配置时不可用、不伪造链接）。
      </div>
      <button className="btn" title="一键创建腾讯会议" disabled={busy} onClick={createOne}>
        {busy ? '创建中…' : '一键创建'}
      </button>

      {msg && <div className="text-brand-green text-[12.5px] mt-2">{msg}</div>}
      {err && <div className="text-destructive text-[12.5px] mt-2">{err}</div>}

      {meetings.length > 0 && (
        <div className="mt-3 flex flex-col gap-[6px]">
          {meetings.map((m) => (
            <div key={m.id} className="py-2 px-[10px] border border-solid border-input rounded-[8px] text-[12.5px]">
              <div className="font-semibold">
                <Video size={13} className="align-[-2px] mr-1" />会议号 {m.tencent_meeting_code}
                <span className="text-[11px] text-muted-foreground"> · {m.tencent_start_time || m.meeting_date}</span>
              </div>
              <div className="mt-1 flex items-center gap-[6px] flex-wrap">
                <a href={m.tencent_join_url} target="_blank" rel="noreferrer" className="break-all">
                  {m.tencent_join_url}
                </a>
                <button className="anbtn" onClick={() => copy(m.tencent_join_url)}>复制链接</button>
                <button className="anbtn" disabled={busy} onClick={() => sync(m.id)}>同步纪要</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'

import type { Meeting } from '@/types/schemas'

import { projectService as ps } from '../../services'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Popover } from '../common/Modal'
import { ChipButton, Dot } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* ═══ b0 · 会议链路卡(接真):tile 数字=真 overview;
   一键建会=真 POST /tencent/quick(TOKEN 未配→如实 400 中性文案,不伪造链接);
   纪要 tile→真会议列表浮层。构图与母版一致(3 tile+箭头)。 ═══ */

export function MeetingTile({
  n,
  unit,
  t,
  s,
  act,
  title,
  onClick,
}: {
  n: string
  unit: string
  t: string
  s: string
  act?: boolean
  title?: string
  onClick?: () => void
}) {
  const Tag = act ? 'button' : 'div'
  return (
    <Tag
      className={`flex flex-1 flex-col gap-1 rounded-sktile border-[0.5px] border-sk-hairsoft bg-transparent p-[9px] px-3 text-left transition-all duration-200 ${
        act ? 'cursor-pointer hover:border-[rgba(127,179,207,.5)] hover:shadow-[0_0_14px_rgba(127,179,207,.1)]' : 'cursor-default hover:border-[rgba(127,179,207,.35)]'
      }`}
      title={title}
      onClick={onClick}
    >
      <div className="font-sans text-[17px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">
        {n}
        <em className="ml-[3px] text-[12px] font-normal not-italic text-sk-muted">{unit}</em>
      </div>
      <div className="font-skcjk text-[12px] font-normal tracking-[0.08em] text-sk-fg">{t}</div>
      <div className="font-skcjk text-[9.5px] font-light tracking-[0.04em] text-sk-muted2">{s}</div>
    </Tag>
  )
}

interface MeetingChainProps {
  projectId: number | null
  meetings: number
  minutes: number
  todos: number
}

export function MeetingChainCard({ projectId, meetings, minutes, todos }: MeetingChainProps) {
  const [creating, setCreating] = useState(false)
  const [made, setMade] = useState<{ code: string; url: string } | null>(null)
  const [makeErr, setMakeErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [list, setList] = useState<Meeting[] | null>(null)
  const [listErr, setListErr] = useState('')

  /* 一键建会:真实外呼腾讯——400=未配置(中性),502=失败(红),都如实 */
  const createMeeting = useCallback(async () => {
    if (creating || projectId == null) return
    setCreating(true)
    setMakeErr('')
    try {
      const m = await ps.quickTencentMeeting(projectId)
      setMade({ code: m.tencent_meeting_code, url: m.tencent_join_url })
    } catch (e) {
      setMakeErr((e as Error).message)
    } finally {
      setCreating(false)
    }
  }, [creating, projectId])

  const copy = () => {
    if (!made?.url) return
    void navigator.clipboard?.writeText(made.url).then(() => setCopied(true)).catch(() => setCopied(false))
  }

  const openList = useCallback(async () => {
    setListOpen((o) => !o)
    if (list || projectId == null) return
    try {
      const d = await ps.listMeetings(projectId)
      setList(d.items)
    } catch (e) {
      setListErr((e as Error).message)
    }
  }, [list, projectId])

  useEffect(() => {
    /* 项目切换后清空本卡状态 */
    setMade(null); setMakeErr(''); setList(null); setListErr(''); setListOpen(false); setCopied(false)
  }, [projectId])

  const notConfigured = makeErr.includes('未配置') || makeErr.includes('not configured') || makeErr.includes('TOKEN')

  return (
    <GlassCard slim overflowVisible data-in>
      <CardHead slim title="会议链路" en="Meeting Chain" right={<HeadNote>创建 → 纪要 → 看板</HeadNote>} />
      <div className="flex flex-1 items-center gap-2">
        <MeetingTile
          n={String(meetings)}
          unit="场"
          t="腾讯会议"
          s={creating ? '创建中…' : '点击创建真实会议'}
          act
          title="以「项目名+当前时刻」创建 1 小时腾讯会议(真实外呼)"
          onClick={createMeeting}
        />
        <span className="flex-none text-[12px] text-sk-muted2">→</span>
        <MeetingTile
          n={String(minutes)}
          unit="条"
          t="会议纪要"
          s="点击查看会议列表"
          act
          title="查看本项目会议与纪要"
          onClick={openList}
        />
        <span className="flex-none text-[12px] text-sk-muted2">→</span>
        <MeetingTile n={String(todos)} unit="待办" t="任务看板" s="纪要回流生成" title="纪要审定后回流生成待办" />
      </div>

      {made && (
        <div className="mt-0.5 flex items-center gap-2.5 rounded-[9px] border-[0.5px] border-dashed border-[rgba(127,179,207,.35)] p-[7px] px-[11px]">
          <span className="font-skcjk text-[11px] font-light text-sk-ok">会议号 {made.code}</span>
          <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-skmono text-[11px] tracking-[0.02em] text-sk-primary">
            {made.url}
          </code>
          <ChipButton className="flex-none" onClick={copy}>{copied ? '已复制' : '复制'}</ChipButton>
        </div>
      )}
      {makeErr && (
        <div className={`font-skcjk text-[11.5px] font-light leading-[1.7] ${notConfigured ? 'text-sk-muted' : 'text-sk-risk'}`}>
          {notConfigured ? `腾讯会议未配置:${makeErr}(配置 TENCENT_MEETING_TOKEN 后可用,不伪造链接)` : `创建失败:${makeErr}`}
        </div>
      )}

      <Popover
        open={listOpen}
        onClose={() => setListOpen(false)}
        title="会议与纪要"
        note="真实记录"
        className="left-0 right-0 top-[calc(100%+8px)] max-h-[240px] overflow-y-auto sk-scroll"
      >
        {listErr && <div className="py-1 font-skcjk text-[12px] font-light text-sk-risk">{listErr}</div>}
        {list && list.length === 0 && (
          <div className="py-1 font-skcjk text-[12px] font-light text-sk-muted">本项目还没有会议记录。</div>
        )}
        {!list && !listErr && <div className="py-1 font-skcjk text-[12px] font-light text-sk-muted2">加载中…</div>}
        {list?.map((m) => (
          <MRow
            key={m.id}
            compact
            lead={<Dot tone={m.status === 'confirmed' ? 'ok' : 'warn'} />}
            text={`${m.title}${m.provider === 'tencent' && m.tencent_meeting_code ? ` · 会议号 ${m.tencent_meeting_code}` : ''}`}
            who={m.meeting_date.slice(5, 10)}
          />
        ))}
      </Popover>
    </GlassCard>
  )
}

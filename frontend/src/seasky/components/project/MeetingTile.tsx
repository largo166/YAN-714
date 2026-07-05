import { useState } from 'react'

import { MEETING_MINUTES } from '../../data/projects.mock'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Popover } from '../common/Modal'
import { ChipButton, Dot } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/** 链路 tile(母版 .ctile;act=可点击) */
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

/** 会议链路卡(P0-5):一键生成会议链接(+复制)/ 纪要浮层入口 / 看板 tile */
export function MeetingChainCard() {
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'selected'>('idle')
  const [minutesOpen, setMinutesOpen] = useState(false)

  const genLink = () => {
    const id = Math.abs((Date.now() + 1) % 0xffffff)
      .toString(36)
      .padStart(6, 'x')
    setLink(`meeting.tencent.com/dm-${id}`) /* 伪 id · 原型示意,不连真实腾讯会议 */
    setCopied('idle')
  }
  const copy = () => {
    if (!link) return
    navigator.clipboard
      ?.writeText(link)
      .then(() => setCopied('copied'))
      .catch(() => setCopied('selected'))
  }

  return (
    <GlassCard slim overflowVisible data-in>
      <CardHead slim title="会议链路" en="Meeting Chain" right={<HeadNote>创建 → 纪要 → 看板</HeadNote>} />
      <div className="flex flex-1 items-center gap-2">
        <MeetingTile n="1" unit="场" t="腾讯会议" s="点击生成会议链接" act title="生成会议链接(原型示意)" onClick={genLink} />
        <span className="flex-none text-[12px] text-sk-muted2">→</span>
        <MeetingTile
          n="4"
          unit="条"
          t="会议纪要"
          s="点击查看 · 回流看板"
          act
          title="查看会议记录"
          onClick={() => setMinutesOpen((o) => !o)}
        />
        <span className="flex-none text-[12px] text-sk-muted2">→</span>
        <MeetingTile n="3" unit="待办" t="任务看板" s="1 项过期 · 需推进" title="对应真实应用的任务看板" />
      </div>
      {link && (
        <div className="mt-0.5 flex items-center gap-2.5 rounded-[9px] border-[0.5px] border-dashed border-[rgba(127,179,207,.35)] p-[7px] px-[11px]">
          <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-skmono text-[11px] tracking-[0.02em] text-sk-primary">
            {link}
          </code>
          <ChipButton className="flex-none" onClick={copy}>
            {copied === 'copied' ? '已复制' : copied === 'selected' ? '已选中' : '复制'}
          </ChipButton>
        </div>
      )}
      <Popover
        open={minutesOpen}
        onClose={() => setMinutesOpen(false)}
        title="会议记录"
        note="原型示意数据"
        className="left-0 right-0 top-[calc(100%+8px)]"
      >
        {MEETING_MINUTES.map((m) => (
          <MRow key={m.txt} compact lead={<Dot tone={m.dot as 'ok' | 'warn'} />} text={m.txt} who={m.who} />
        ))}
      </Popover>
    </GlassCard>
  )
}

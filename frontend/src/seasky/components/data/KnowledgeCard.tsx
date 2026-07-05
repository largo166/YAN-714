import { useState } from 'react'

import { RECENT_INTAKE } from '../../data/projects.mock'
import { Popover } from '../common/Modal'
import { GhostButton, Pill } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/** 最近入库(锚点浮层,P0-4 首屏收纳:文件名长列表不进首屏) */
export function RecentIntakeCard() {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative">
      <GhostButton
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        最近入库 ›
      </GhostButton>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        title="最近入库"
        note="Recent 5"
        className="bottom-[calc(100%+10px)] left-0 min-w-[430px]"
      >
        {RECENT_INTAKE.map((r) => (
          <MRow key={r.txt} compact lead={<Pill>{r.pill}</Pill>} text={r.txt} who={r.who} />
        ))}
      </Popover>
    </span>
  )
}

import { BROADCASTS } from '../../data/broadcasts.mock'
import { Dot } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/** 发全员通知(母版 gd 区:cmdline + 近期两条) */
export function BroadcastPanel() {
  return (
    <div className="flex items-start gap-[30px]">
      <div className="sk-cmdline flex flex-[1.1] items-center gap-3.5 border-b-2 border-sk-hairsoft px-0.5 pb-2.5 pt-1.5">
        <input
          className="flex-1 border-0 bg-transparent font-skcjk text-[15px] font-light tracking-[0.06em] text-sk-fg outline-none placeholder:text-sk-muted2"
          placeholder="输入要广播给全员的通知…"
        />
        <button className="cursor-pointer rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-transparent px-[18px] py-[7px] font-sans text-[10px] font-medium uppercase tracking-[0.24em] text-sk-primary transition-colors duration-200 hover:bg-sk-primary hover:text-[#0a0c0e]">
          发布
        </button>
      </div>
      <div className="flex-1">
        {BROADCASTS.map((b) => (
          <MRow key={b.txt} compact noBorder lead={<Dot tone={b.dot as 'ok' | 'warn'} />} text={b.txt} who={b.who || undefined} />
        ))}
      </div>
    </div>
  )
}

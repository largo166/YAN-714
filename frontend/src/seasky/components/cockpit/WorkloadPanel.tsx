import { WORKLOAD } from '../../data/usage.mock'

/** 成员工作量(母版:分段=项目,悬停 title 看明细) */
export function WorkloadPanel() {
  return (
    <div className="mt-1 grid gap-[15px]">
      {WORKLOAD.map((w) => (
        <div key={w.name} className="grid grid-cols-[64px_1fr_44px] items-center gap-[13px]" title={w.title}>
          <span className="font-skcjk text-[12.5px] font-light text-sk-muted">{w.name}</span>
          <div className="flex h-[5px] gap-0.5 overflow-hidden rounded-[3px] bg-[rgba(242,241,238,.05)]">
            {w.segs.map((s, i) => (
              <i key={i} className="block h-full" style={{ width: `${s.w}%`, background: s.c }} />
            ))}
          </div>
          <span className="text-right font-skcjk text-[9.5px] tracking-[0.1em]" style={{ color: w.tagColor }}>
            {w.tag}
          </span>
        </div>
      ))}
    </div>
  )
}

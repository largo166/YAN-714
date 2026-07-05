import { USAGE_CONIC, USAGE_LEGEND, USAGE_TOTAL } from '../../data/usage.mock'

/** AI 使用甜甜圈+图例(母版 .donut/.legend) */
export function UsageDonut() {
  return (
    <div className="flex flex-1 items-center gap-[26px]">
      <div className="grid h-[118px] w-[118px] flex-none place-items-center rounded-full" style={{ background: USAGE_CONIC }}>
        <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-[#0d1013] text-center">
          <div>
            <div className="font-sans text-[22px] font-medium leading-none text-sk-fg">{USAGE_TOTAL}</div>
            <div className="mt-1 text-[9px] tracking-[0.2em] text-sk-muted2">次成果</div>
          </div>
        </div>
      </div>
      <div className="grid flex-1 gap-2">
        {USAGE_LEGEND.map((l) => (
          <div key={l.t} className="flex items-center gap-[9px] font-skcjk text-[12px] font-light tracking-[0.06em] text-sk-muted">
            <span className="h-[9px] w-[9px] flex-none rounded-[2.5px]" style={{ background: l.sw }} />
            {l.t}
            <span className="ml-auto font-sans font-medium text-[#c9ccd0]">{l.v}</span>
          </div>
        ))}
      </div>
      <UsageTrend />
    </div>
  )
}

/** 近 14 日趋势(母版 .spark:静态条,零位移——晕动症红线内) */
export function UsageTrend() {
  const days = [1, 2, 0, 3, 2, 4, 1, 2, 5, 3, 4, 2, 6, 4]
  const max = Math.max(...days)
  return (
    <div className="w-[150px] flex-none self-center">
      <div className="mt-0.5 flex h-9 items-end gap-[3px]" title="近 14 日 AI 调用趋势">
        {days.map((v, i) => (
          <i
            key={i}
            className="block flex-1 rounded-t-[2px]"
            style={{
              height: v === 0 ? '2px' : `${Math.max(6, Math.round((v / max) * 100))}%`,
              background: 'linear-gradient(180deg, rgba(127,179,207,.75), rgba(79,127,158,.35))',
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="font-sans text-[8px] font-medium uppercase tracking-[0.3em] text-sk-muted2">近 14 日调用</span>
        <span className="font-sans text-[8px] font-medium uppercase tracking-[0.3em] text-sk-muted2">总 39</span>
      </div>
    </div>
  )
}

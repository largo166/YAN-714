import { DATA_TYPES } from '../../data/projects.mock'

/** 类型统计 tile 带(母版 .ttiles) */
export function DataTypeTabs() {
  return (
    <div className="flex flex-wrap gap-2.5">
      {DATA_TYPES.map((t) => (
        <div
          key={t.t}
          className="min-w-[86px] cursor-default rounded-[12px] border-[0.5px] border-sk-hairsoft px-4 py-2.5 transition-colors duration-200 hover:border-[rgba(127,179,207,.35)]"
        >
          <div className="font-sans text-[20px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">{t.n}</div>
          <div className="mt-[3px] font-skcjk text-[11px] font-light tracking-[0.1em] text-sk-muted2">{t.t}</div>
        </div>
      ))}
    </div>
  )
}

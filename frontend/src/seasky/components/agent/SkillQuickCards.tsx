/* 四张快捷卡(截图3基准构图冻结):图标章 + 标题 + 副题;cards 由调用方给(真技能 id) */

import type { QuickCardDef } from '../../data/campCards'

export function SkillQuickCards({ cards, onPick }: { cards: readonly QuickCardDef[]; onPick: (skillId: string) => void }) {
  return (
    <div className="mt-4 flex w-full gap-3" data-in>
      {cards.map((c) => (
        <button
          key={c.t}
          className="sk-hairline-top relative flex min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1.5 rounded-skcard border-[0.5px] border-sk-border bg-[rgba(255,255,255,.02)] px-4 py-3 text-left backdrop-blur-[12px] transition-all duration-[250ms] hover:-translate-y-[2px] hover:border-[rgba(127,179,207,.42)] hover:bg-sk-card hover:shadow-[0_0_20px_rgba(127,179,207,.08)]"
          onClick={() => onPick(c.skillId)}
        >
          <span className="flex items-center gap-2">
            <span className="grid h-6 w-6 flex-none place-items-center rounded-[7px] border-[0.5px] border-sk-hair text-[12px] text-sk-primary">
              {c.i}
            </span>
            <span className="font-skcjk text-[13px] font-normal tracking-[0.06em] text-sk-fg">{c.t}</span>
          </span>
          <span className="truncate font-skcjk text-[11px] font-light tracking-[0.02em] text-sk-muted2">{c.s}</span>
        </button>
      ))}
    </div>
  )
}

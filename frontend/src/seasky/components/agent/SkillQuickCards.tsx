/* 四张快捷卡(截图3基准构图冻结):图标章 + 标题 + 副题;cards 由调用方给(真技能 id) */

export interface QuickCardDef {
  i: string
  t: string
  s: string
  skillId: string
}

export function SkillQuickCards({ cards, onPick }: { cards: readonly QuickCardDef[]; onPick: (skillId: string) => void }) {
  return (
    <div className="mt-[18px] flex w-[min(1020px,94%)] gap-3.5" data-in>
      {cards.map((c) => (
        <button
          key={c.t}
          className="sk-hairline-top relative flex min-w-0 flex-1 cursor-pointer flex-col gap-[9px] rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-4 px-[18px] pb-[15px] text-left backdrop-blur-[12px] transition-all duration-[250ms] hover:-translate-y-[3px] hover:border-[rgba(127,179,207,.42)] hover:shadow-[0_0_26px_rgba(127,179,207,.1)]"
          onClick={() => onPick(c.skillId)}
        >
          <span className="grid h-8 w-8 place-items-center rounded-[9px] border-[0.5px] border-sk-hair text-[14px] text-sk-primary">
            {c.i}
          </span>
          <span className="font-skcjk text-[13.5px] font-normal tracking-[0.08em] text-sk-fg">{c.t}</span>
          <span className="font-skcjk text-[11px] font-light leading-[1.7] tracking-[0.04em] text-sk-muted2">{c.s}</span>
        </button>
      ))}
    </div>
  )
}

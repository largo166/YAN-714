import { DataSourceStrip } from '../data/DataSourceStrip'
import { DataTypeTabs } from '../data/DataTypeTabs'
import { RecentIntakeCard } from '../data/KnowledgeCard'
import { Label, Pill } from '../common/PillButton'

/* ═══ b1 数据基地:大字纪念碑(CLOU 胆量)——一页只讲「检索记忆」一件事 ═══ */

export function KnowledgeBaseBoard() {
  return (
    <>
      <div className="absolute inset-0 flex flex-col justify-center gap-[26px] px-24 pb-[118px]">
        <Label data-in>Data Base{'　'}记忆底座 · 每一份材料都成为记忆</Label>

        {/* 主角:巨号 640 */}
        <div className="flex items-baseline gap-[38px]" data-in>
          <span className="font-sans text-[148px] font-medium leading-[0.92] tracking-[-0.02em] text-sk-fg [font-variant-numeric:tabular-nums]">
            640
          </span>
          <div className="flex gap-10 pb-2.5">
            {(
              [
                ['100%', '索引完成率'],
                ['74,629', '索引块 · CJK 全文'],
                ['1,169', '图片资产 · 生图工坊'],
              ] as const
            ).map(([v, k]) => (
              <div key={k} className="flex flex-col gap-2 font-sans text-[22px] font-medium text-sk-primary">
                {v}
                <span className="font-skcjk text-[11px] font-light tracking-[0.14em] text-sk-muted2">{k}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 大检索行 */}
        <div className="sk-cmdline flex max-w-[660px] items-center gap-3.5 border-b-2 border-sk-hairsoft px-0.5 pb-2.5 pt-1.5" data-in>
          <input
            className="flex-1 border-0 bg-transparent font-skcjk text-[16.5px] font-light tracking-[0.06em] text-sk-fg outline-none placeholder:text-sk-muted2"
            placeholder="搜索已入库资料(关键词 / 编号 / 中文短语)…"
          />
          <button className="cursor-pointer rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-transparent px-[18px] py-[7px] font-sans text-[10px] font-medium uppercase tracking-[0.24em] text-sk-primary transition-colors duration-200 hover:bg-sk-primary hover:text-[#0a0c0e]">
            Search
          </button>
        </div>

        {/* 类型带 + 最近入库 + 收件箱状态 */}
        <div className="relative flex flex-wrap items-center gap-2.5" data-in>
          <DataTypeTabs />
          <RecentIntakeCard />
          <Pill tone="ok">收件箱 · 运行中 · 待处理 355</Pill>
        </div>
      </div>
      <DataSourceStrip />
    </>
  )
}

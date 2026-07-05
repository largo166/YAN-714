import { CAL_DOW, CAL_EVENTS, CAL_LEAD_DIM, CAL_TAIL_DIM, CAL_TODAY } from '../../data/calendar.mock'
import { PROJ_COLORS } from '../../lib/constants'
import { cn } from '../../lib/cn'

/* ═══ 项目日历(月视图):事件点色标=项目;当前项目事件高亮其余降噪;
   b4 波接真(里程碑+会议前端聚合;不可控则降级里程碑单源)。names=真实项目名列表 ═══ */

export function ProjectCalendar({ curIdx, names }: { curIdx: number; names: string[] }) {
  const usedProjects = [...new Set(Object.values(CAL_EVENTS).flat().map((e) => e.p))].sort()

  return (
    <>
      {/* 图例(独立一行,不挤标题) */}
      <div className="-mt-0.5 flex flex-wrap gap-3.5">
        {usedProjects.map((p) => (
          <span
            key={p}
            className={cn(
              'flex items-center gap-[7px] whitespace-nowrap font-skcjk text-[11px] font-light tracking-[0.08em]',
              p === curIdx ? 'text-sk-fg' : 'text-sk-muted2',
            )}
          >
            <i
              className={cn('block h-[3px] w-3.5 rounded-[2px]', p === curIdx && 'shadow-[0_0_8px_rgba(127,179,207,.6)]')}
              style={{ background: PROJ_COLORS[p] }}
            />
            {names[p] ?? `项目${p + 1}`}
          </span>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        <div className="grid flex-1 grid-cols-7 gap-1">
          {CAL_DOW.map((d) => (
            <span key={d} className="py-0.5 text-center font-sans text-[8.5px] font-medium uppercase tracking-[0.22em] text-sk-muted2">
              {d}
            </span>
          ))}
          {CAL_LEAD_DIM.map((d) => (
            <CalCell key={`lead-${d}`} day={d} dim curIdx={curIdx} names={names} />
          ))}
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <CalCell key={day} day={day} today={day === CAL_TODAY} events={CAL_EVENTS[day]} curIdx={curIdx} names={names} />
          ))}
          {CAL_TAIL_DIM.map((d) => (
            <CalCell key={`tail-${d}`} day={d} dim curIdx={curIdx} names={names} />
          ))}
        </div>
      </div>
    </>
  )
}

function CalCell({
  day,
  dim,
  today,
  events,
  curIdx,
  names,
}: {
  day: number
  dim?: boolean
  today?: boolean
  events?: { p: number; t: string }[]
  curIdx: number
  names: string[]
}) {
  const title = events?.map((e) => `${names[e.p] ?? `项目${e.p + 1}`} · ${e.t}`).join('\n')
  return (
    <span
      className={cn(
        'relative min-h-[34px] rounded-lg border-[0.5px] border-transparent p-[5px] px-[7px] font-sans text-[11px] font-normal text-sk-muted transition-colors duration-200 hover:border-sk-hair',
        dim && 'text-[rgba(161,165,170,.25)]',
        today && 'border-[rgba(127,179,207,.5)] text-sk-primary',
      )}
      title={title}
    >
      {day}
      {events && (
        <span className="absolute bottom-[5px] left-[7px] right-[7px] flex gap-[3px]">
          {events.map((e, i) => (
            <i
              key={i}
              className="block h-[3px] flex-1 rounded-[2px] transition-opacity duration-200"
              style={{ background: PROJ_COLORS[e.p], opacity: e.p === curIdx ? 1 : 0.4 }}
            />
          ))}
        </span>
      )}
    </span>
  )
}

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

import { BOARD_PILLARS, type BoardIndex } from '../../lib/constants'
import { sweepOnce, trigWave } from '../../lib/seaUniforms'

/* ═══ 五大板块展开页(母版 boards 场景) ═══ */

export function BoardsSelect({ onEnter }: { onEnter: (i: BoardIndex) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    sweepOnce(gsap)
    gsap.to(root.querySelector('.frame-title'), { opacity: 1, duration: 1.2 * 0.7 })
    root.querySelectorAll('.bp').forEach((c, i) => {
      gsap.fromTo(
        c,
        { opacity: 0, y: 26 },
        {
          opacity: 1,
          y: 0,
          duration: 1.2 * 0.7,
          ease: 'premium',
          delay: 0.15 + i * 0.14,
          onStart: () => trigWave(0.15 + i * 0.175, 0.5, 0.08),
        },
      )
    })
    gsap.to(root.querySelector('.boards-hint'), { opacity: 1, duration: 0.6, delay: 1.1 })
  }, [])

  /* Enter 直达项目中心(母版键盘约定) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onEnter(0)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [onEnter])

  return (
    <div ref={rootRef} className="absolute inset-0 z-[5] flex flex-col items-center justify-center">
      <div className="frame-title absolute top-24 font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] [text-indent:0.3em] text-sk-muted2 opacity-0">
        Five Boards{'　'}五大板块
      </div>
      <div className="flex gap-[22px]">
        {BOARD_PILLARS.map((p, i) => (
          <button
            key={p.no}
            className="bp sk-hairline-top relative flex w-[206px] cursor-pointer flex-col gap-3.5 rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-[30px] px-6 pb-[26px] text-left opacity-0 backdrop-blur-[12px] transition-all duration-[250ms] hover:-translate-y-1 hover:border-[rgba(127,179,207,.4)] hover:shadow-skglow"
            onClick={() => onEnter(i as BoardIndex)}
          >
            <div className="font-sans text-[12px] font-medium tracking-[0.12em] text-sk-primary">{p.no}</div>
            <div className="font-skcjk text-[19px] font-normal tracking-[0.1em] text-sk-fg">{p.zh}</div>
            <div className="whitespace-pre-line font-skcjk text-[12px] font-light leading-[1.9] tracking-[0.06em] text-sk-muted">
              {p.role}
            </div>
          </button>
        ))}
      </div>
      <div className="boards-hint absolute bottom-24 font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] [text-indent:0.3em] text-sk-muted2 opacity-0">
        点击进入 · Enter 直达项目中心
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

import { LS_KEYS } from '../../lib/constants'
import { lsGet, lsRemove, lsSet } from '../../lib/storage'

/** 开机 Skip(母版等价):首帧即可点,Esc 同效,勾选「下次直达」记住 */
export function SkipIntro({ onSkip }: { onSkip: () => void }) {
  const [checked, setChecked] = useState(
    () => lsGet(LS_KEYS.skipIntro) === '1' || lsGet(LS_KEYS.seenIntro) === '1',
  )

  const toggle = useCallback((v: boolean) => {
    setChecked(v)
    if (v) lsSet(LS_KEYS.skipIntro, '1')
    else {
      lsSet(LS_KEYS.skipIntro, '0')
      lsRemove(LS_KEYS.seenIntro) /* 取消勾选=下次重看影片 */
    }
  }, [])

  return (
    <button
      className="absolute bottom-[58px] right-6 z-[72] cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-[rgba(10,12,14,.4)] px-[22px] py-[9px] font-sans text-[10px] font-medium uppercase tracking-[0.28em] text-sk-muted2 backdrop-blur-[8px] transition-all duration-[250ms] hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
      onClick={() => {
        lsSet(LS_KEYS.seenIntro, '1')
        onSkip()
      }}
    >
      Skip
      <label
        className="ml-3.5 inline-flex cursor-pointer items-center gap-[7px] border-l-[0.5px] border-sk-hairsoft pl-3.5 tracking-[0.14em]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          className="h-[11px] w-[11px] cursor-pointer accent-sk-primary"
          checked={checked}
          onChange={(e) => toggle(e.target.checked)}
        />
        下次直达
      </label>
    </button>
  )
}

/** 电影黑带+暗角+颗粒(母版电影化层;app 相撤黑带由 AppShell 控制) */
export function CineLayer({ hideBars }: { hideBars: boolean }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-[63]"
        style={{ background: 'radial-gradient(ellipse 78% 74% at 50% 48%, transparent 50%, rgba(3,5,7,.42))' }}
      />
      <div className="sk-grain" />
      {!hideBars && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-[66] h-[46px] w-full bg-black" />
          <div className="pointer-events-none absolute bottom-0 left-0 z-[66] h-[46px] w-full bg-black" />
        </>
      )}
    </>
  )
}

/**
 * 流体舞台(母版 fit() 等价,P0-4 灭黑边):
 * stage 逻辑尺寸跟随窗口纵横比,缩放系数取 contain 基准——任意窗口比例零 letterbox,设计字号视觉不变。
 */
export function useFluidStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    function fit() {
      const k = Math.min(innerWidth / 1280, innerHeight / 720)
      st!.style.width = `${innerWidth / k}px`
      st!.style.height = `${innerHeight / k}px`
      st!.style.transform = `scale(${k})`
    }
    fit()
    addEventListener('resize', fit)
    return () => removeEventListener('resize', fit)
  }, [])
  return stageRef
}

/** data-in 入场(P1:每页一种入场,0.55s 淡入上浮) */
export function runBoardEntrance(root: HTMLElement, skip?: boolean) {
  const els = root.querySelectorAll('[data-in]')
  if (!els.length) return
  if (skip) {
    gsap.set(els, { opacity: 1, y: 0 })
    return
  }
  gsap.fromTo(
    els,
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, duration: 0.55, ease: 'premium', stagger: 0.05, overwrite: 'auto' },
  )
}

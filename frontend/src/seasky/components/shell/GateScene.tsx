import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

import { boost, energy, order, sweepOnce, trigWave } from '../../lib/seaUniforms'

/* ═══ 驾驶舱口令闸(母版 gate 1:1):键盘打点、退格、<4位 shake、Enter 解锁 ═══ */

const label = 'font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] [text-indent:0.3em] text-sk-muted2'

export function GateScene({ onUnlock }: { onUnlock: () => void }) {
  const [pw, setPw] = useState('')
  const [state, setState] = useState<'locked' | 'err' | 'unlocked'>('locked')
  const rootRef = useRef<HTMLDivElement>(null)
  const pwRef = useRef(pw)
  pwRef.current = pw
  const stateRef = useRef(state)
  stateRef.current = state

  /* 入场(母版 enterGate 的 gsap 编排) */
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    gsap.to(order, { v: 1, duration: 1.6, ease: 'premium' })
    gsap.to(energy, { v: 0.3, duration: 1.6, ease: 'premium' })
    sweepOnce(gsap)
    gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.8, ease: 'premium' })
    gsap.fromTo(
      root.querySelectorAll('.bracket'),
      { opacity: 0, x: (i: number) => [5, -5, 5, -5][i], y: (i: number) => [5, 5, -5, -5][i] },
      { opacity: 1, x: 0, y: 0, duration: 0.6, stagger: 0.08, delay: 0.2 },
    )
    trigWave(0.5, 0.5, 0.1)
  }, [])

  const submit = useCallback(() => {
    if (stateRef.current === 'unlocked') return
    if (pwRef.current.length < 4) {
      setState('err')
      setTimeout(() => setState('locked'), 500)
      return
    }
    setState('unlocked')
    gsap.to(boost, { v: 0.7, duration: 0.5, ease: 'power2.in' })
    gsap.to(boost, { v: 0, duration: 1.6, ease: 'premium', delay: 0.55 })
    trigWave(0.5, 0.5, 0.16)
    const root = rootRef.current
    gsap.to(root, {
      opacity: 0,
      duration: 0.6,
      ease: 'premiumOut',
      delay: 0.35,
      onComplete: onUnlock,
    })
  }, [onUnlock])

  /* 键盘:字符打点/退格/Enter(母版 gateType/gateBack/gateSubmit) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stateRef.current === 'unlocked') return
      if (e.key === 'Enter') {
        submit()
        return
      }
      if (e.key === 'Backspace') {
        setPw((p) => p.slice(0, -1))
        return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setPw((p) => {
          if (p.length >= 12) return p
          trigWave(0.5, 0.51, 0.08)
          return p + e.key
        })
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [submit])

  const bracket = 'bracket absolute w-[18px] h-[18px] border-[rgba(242,241,238,.28)] opacity-0'

  return (
    <div ref={rootRef} className="absolute inset-0 z-[5] flex flex-col items-center justify-center">
      <div className={`${bracket} left-[60px] top-[60px]`} style={{ borderWidth: '1px 0 0 1px', borderStyle: 'solid' }} />
      <div className={`${bracket} right-[60px] top-[60px]`} style={{ borderWidth: '1px 1px 0 0', borderStyle: 'solid' }} />
      <div className={`${bracket} bottom-[60px] left-[60px]`} style={{ borderWidth: '0 0 1px 1px', borderStyle: 'solid' }} />
      <div className={`${bracket} bottom-[60px] right-[60px]`} style={{ borderWidth: '0 1px 1px 0', borderStyle: 'solid' }} />
      <div className="absolute top-[66px] flex w-full justify-between px-[92px]">
        <span className={label}>Cockpit</span>
        <span className={`${label} text-sk-primary`}>● Memory Layer</span>
      </div>
      <div className="absolute bottom-[66px] flex w-full justify-between px-[92px]">
        <span className={label}>ROM-AI</span>
        <span className={label} style={state === 'unlocked' ? { color: 'var(--sk-primary)' } : undefined}>
          {state === 'unlocked' ? 'Unlocked' : 'Locked'}
        </span>
      </div>

      <div className={`flex -translate-y-1.5 flex-col items-center gap-[22px] ${state === 'err' ? 'sk-shaking' : ''}`}>
        <div className={`mb-[34px] ${label}`}>Cockpit Access{'　'}驾驶舱口令</div>
        <div className="flex min-h-[48px] items-baseline font-sans text-[36px] font-medium tracking-[0.32em] text-sk-fg">
          <span>
            {pw.split('').map((_, i) => (
              <span key={i} className="mx-[5px] inline-block align-[6px] text-[15px]">
                ●
              </span>
            ))}
          </span>
          <span className="sk-cursor" />
        </div>
        <div className="relative h-0.5 w-[400px] bg-sk-hairsoft">
          <i
            className="absolute left-0 top-0 block h-full transition-[width] duration-[180ms] ease-out"
            style={{ width: `${(pw.length / 12) * 100}%`, background: state === 'err' ? 'var(--sk-risk)' : 'var(--sk-primary)' }}
          />
        </div>
        <div className={`mt-7 ${label}`}>
          {state === 'err' ? '口令至少 4 位 · 原型演示可输任意口令' : '输入口令 · Enter 解锁'}
        </div>
      </div>
    </div>
  )
}

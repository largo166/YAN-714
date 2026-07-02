import { useEffect, useRef, useState } from 'react'

/** 数字滚动到位（动效三层·层3）。真实值驱动,只在值变化时滚一次;
 *  prefers-reduced-motion 时直接显示终值(克制红线)。 */
export function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target
      setVal(target)
      return
    }
    const from = fromRef.current
    if (from === target) {
      setVal(target)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration)
      const e = 1 - Math.pow(1 - k, 3) // easeOutCubic
      setVal(Math.round(from + (target - from) * e))
      if (k < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

/** 便捷组件形态：<CountNum n={128} /> —— 在 JSX 里滚数字。 */
export function CountNum({ n, duration }: { n: number; duration?: number }) {
  return <>{useCountUp(n, duration)}</>
}

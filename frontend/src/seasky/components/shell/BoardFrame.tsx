import { useEffect, useRef, type ReactNode } from 'react'

import { runBoardEntrance } from './SkipIntro'

/**
 * 板块容器(母版 .board):顶 46 底 30 满铺。
 * active 时跑 data-in 入场(P1:每页一种入场 0.55s);skipAnim=截图模式直出稳定帧。
 * 五板块恒挂载、display 切换——与母版/主 App workzone 同一回归口径。
 */
export function BoardFrame({ active, skipAnim, children }: { active: boolean; skipAnim?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const wasActive = useRef(false)

  useEffect(() => {
    if (active && ref.current) {
      runBoardEntrance(ref.current, skipAnim)
      wasActive.current = true
    }
  }, [active, skipAnim])

  return (
    <section ref={ref} className="absolute bottom-[30px] left-0 top-[46px] w-full" style={{ display: active ? 'block' : 'none' }}>
      {children}
    </section>
  )
}

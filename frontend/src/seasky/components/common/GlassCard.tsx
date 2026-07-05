import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** slim=紧凑卡(b0 右列);默认=标准卡 */
  slim?: boolean
  /** 浮层需要溢出可见(锚点 pop 挂在卡内) */
  overflowVisible?: boolean
  children: ReactNode
}

/** 玻璃卡(母版 .gcard):玻璃地层+细边+顶部渐隐高光 */
export function GlassCard({ slim, overflowVisible, className, children, ...rest }: GlassCardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'sk-hairline-top relative flex min-w-0 flex-col rounded-skcard border-[0.5px] border-sk-border bg-sk-card backdrop-blur-[12px]',
        slim ? 'gap-[7px] px-4 py-[11px]' : 'gap-3 px-[22px] py-[18px]',
        overflowVisible ? 'overflow-visible' : 'overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface CardHeadProps {
  title: string
  en?: string
  right?: ReactNode
  slim?: boolean
}

/** 卡头(母版 .g-head):中文标题 + 英文小注 + 右侧注释 */
export function CardHead({ title, en, right, slim }: CardHeadProps) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className={cn('font-skcjk font-normal tracking-[0.1em] text-sk-fg', slim ? 'text-[13.5px]' : 'text-[15px]')}
      >
        {title}
      </span>
      {en && (
        <span className="font-sans text-[9.5px] font-medium uppercase tracking-[0.26em] text-sk-muted2 opacity-85">
          {en}
        </span>
      )}
      {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
    </div>
  )
}

/** 卡头右侧英文注释 */
export function HeadNote({ children }: { children: ReactNode }) {
  return (
    <span className="font-sans text-[9.5px] font-medium uppercase tracking-[0.26em] text-sk-muted2 opacity-85">
      {children}
    </span>
  )
}

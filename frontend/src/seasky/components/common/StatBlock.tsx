import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface StatBlockProps {
  value: ReactNode
  unit?: string
  label: string
  tone?: 'pri' | 'risk' | 'warn' | ''
  /** compact=b0 右列 26px;默认 46px HERO 尺寸 */
  compact?: boolean
  alignLeft?: boolean
}

/** 大数字统计块(母版 .hstat) */
export function StatBlock({ value, unit, label, tone = '', compact, alignLeft }: StatBlockProps) {
  return (
    <div className={alignLeft ? 'text-left' : 'text-right'}>
      <div
        className={cn(
          'font-sans font-medium leading-none tracking-[-0.01em] text-sk-fg [font-variant-numeric:tabular-nums]',
          compact ? 'text-[26px]' : 'text-[46px]',
          tone === 'pri' && 'text-sk-primary',
          tone === 'risk' && 'text-sk-risk',
          tone === 'warn' && 'text-sk-warn',
        )}
      >
        {value}
        {unit && <small className="ml-0.5 text-[18px] font-normal text-sk-muted">{unit}</small>}
      </div>
      <div
        className={cn(
          'font-sans font-medium uppercase tracking-[0.3em] text-sk-muted2 [text-indent:0.3em]',
          compact ? 'mt-[5px] text-[9px]' : 'mt-2.5 text-[10.5px]',
        )}
      >
        {label}
      </div>
    </div>
  )
}

/** 行式条目(母版 .mrow):点/pill + 文本 + 右注 */
export function MRow({
  lead,
  text,
  who,
  compact,
  noBorder,
}: {
  lead?: ReactNode
  text: string
  who?: string
  compact?: boolean
  noBorder?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-2.5 border-b-[0.5px] border-sk-hairsoft font-light tracking-[0.03em] text-sk-muted last:border-b-0',
        compact ? 'py-1 text-[11px] leading-[1.6]' : 'py-[7px] text-[12.5px] leading-[1.8]',
        noBorder && 'border-b-0',
      )}
    >
      {lead}
      <span className="flex-1 text-[#c9ccd0]">{text}</span>
      {who && <span className="flex-none text-[11px] text-sk-muted2">{who}</span>}
    </div>
  )
}

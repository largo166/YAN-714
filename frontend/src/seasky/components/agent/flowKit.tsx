import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

/* b2 对话流 · 动作卡外壳与三态 pill(海天 token 版;状态语言与 W0/campFlow 同调) */

export type CardTone = 'pending' | 'ok' | 'error' | 'neutral'

const TONE: Record<CardTone, { color: string; cls: string }> = {
  pending: { color: 'var(--sk-warn)', cls: 'text-sk-warn border-[rgba(201,178,127,.4)]' },
  ok: { color: 'var(--sk-ok)', cls: 'text-sk-ok border-[rgba(126,201,165,.35)]' },
  error: { color: 'var(--sk-risk)', cls: 'text-sk-risk border-[rgba(207,127,127,.4)]' },
  neutral: { color: 'var(--sk-muted)', cls: 'text-sk-muted border-sk-hair' },
}

export function FlowTonePill({ tone, text }: { tone: CardTone; text: string }) {
  const t = TONE[tone]
  return (
    <span className={cn('inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full border-[0.5px] px-2.5 py-0.5 font-skcjk text-[10.5px] font-light tracking-[0.08em]', t.cls)}>
      <span
        className={cn('h-[5px] w-[5px] rounded-full', tone === 'pending' && 'animate-pulse')}
        style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }}
      />
      {text}
    </span>
  )
}

/** 流内动作卡外壳:玻璃卡+发丝高光+头行 */
export function FlowCard({ icon, title, pill, children }: { icon: ReactNode; title: string; pill: ReactNode; children: ReactNode }) {
  return (
    <div className="sk-hairline-top relative flex flex-col gap-2.5 overflow-visible rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-[13px] px-[15px] backdrop-blur-[12px]">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-[9px] border-[0.5px] border-sk-hair text-[13px] text-sk-primary">{icon}</span>
        <span className="min-w-0 flex-1 font-skcjk text-[13px] font-normal tracking-[0.08em] text-sk-fg">{title}</span>
        {pill}
      </div>
      <div className="font-skcjk text-[12.5px] font-light leading-[1.8] tracking-[0.02em] text-[#c9ccd0]">{children}</div>
    </div>
  )
}

/** 卡内按钮 */
export function FlowBtn({
  kind = 'ghost',
  disabled,
  onClick,
  children,
}: {
  kind?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'h-[30px] cursor-pointer rounded-[9px] border-[0.5px] px-3.5 font-skcjk text-[12px] font-normal tracking-[0.06em] transition-all duration-150 disabled:cursor-default disabled:opacity-45',
        kind === 'primary' && 'border-[rgba(127,179,207,.5)] bg-[rgba(127,179,207,.14)] text-sk-fg hover:bg-[rgba(127,179,207,.22)]',
        kind === 'ghost' && 'border-sk-hair bg-[rgba(242,241,238,.03)] text-sk-muted hover:text-sk-fg',
        kind === 'danger' && 'border-[rgba(207,127,127,.45)] bg-[rgba(207,127,127,.08)] text-sk-risk',
      )}
    >
      {children}
    </button>
  )
}

/** 诚实计数行 */
export function FlowCounts({ items }: { items: [string, number, string?][] }) {
  return (
    <div className="flex flex-wrap gap-4">
      {items.map(([label, n, color]) => (
        <span key={label} className="font-skcjk text-[11.5px] font-light text-sk-muted">
          <b className="mr-1 font-sans text-[16px] font-medium [font-variant-numeric:tabular-nums]" style={{ color: color || 'var(--sk-foreground)' }}>
            {n}
          </b>
          {label}
        </span>
      ))}
    </div>
  )
}

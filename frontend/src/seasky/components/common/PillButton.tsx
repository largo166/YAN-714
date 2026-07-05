import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

type Tone = 'default' | 'pri' | 'ok' | 'warn' | 'risk'

const pillTone: Record<Tone, string> = {
  default: 'border-sk-hair text-sk-muted',
  pri: 'border-[rgba(127,179,207,.35)] text-sk-primary',
  ok: 'border-[rgba(126,201,165,.3)] text-sk-ok',
  warn: 'border-[rgba(201,178,127,.3)] text-sk-warn',
  risk: 'border-[rgba(207,127,127,.32)] text-sk-risk',
}

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  children: ReactNode
}

/** 状态 pill(母版 .pill) */
export function Pill({ tone = 'default', className, children, ...rest }: PillProps) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-[0.5px] px-[11px] py-[3px] font-skcjk text-[10.5px] font-normal tracking-[0.1em]',
        pillTone[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

interface GhostButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pri?: boolean
  children: ReactNode
}

/** 幽灵按钮(母版 .ghost) */
export function GhostButton({ pri, className, children, ...rest }: GhostButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'cursor-pointer rounded-full border-[0.5px] bg-transparent px-5 py-2 font-skcjk text-[11.5px] font-normal tracking-[0.14em] transition-all duration-200',
        pri
          ? 'border-[rgba(127,179,207,.4)] text-sk-primary hover:bg-sk-primary hover:text-[#0a0c0e]'
          : 'border-sk-hair text-sk-muted hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}

interface ChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
}

/** 小 chip 按钮(母版 .chip-sm) */
export function ChipButton({ className, children, ...rest }: ChipButtonProps) {
  return (
    <button
      {...rest}
      className={cn(
        'cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-1 font-skcjk text-[10.5px] font-light tracking-[0.1em] text-sk-muted2 transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** eyebrow 小标(母版 .label) */
export function Label({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        'font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] text-sk-muted2 [text-indent:0.3em]',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** 状态点(母版 .dot) */
export function Dot({ tone, glow }: { tone: 'ok' | 'warn' | 'risk'; glow?: boolean }) {
  const bg = tone === 'ok' ? 'bg-sk-ok' : tone === 'warn' ? 'bg-sk-warn' : 'bg-sk-risk'
  const shadow =
    glow || tone === 'risk'
      ? tone === 'ok'
        ? 'shadow-[0_0_8px_rgba(126,201,165,.5)]'
        : 'shadow-[0_0_8px_rgba(207,127,127,.5)]'
      : ''
  return <span className={cn('inline-block h-[5px] w-[5px] flex-none self-center rounded-full', bg, shadow)} />
}

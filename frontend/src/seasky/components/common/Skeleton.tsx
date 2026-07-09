import type { CSSProperties } from 'react'

import { cn } from '../../lib/cn'
import { GhostButton, Label } from './PillButton'

/* ═══ B⑤ 骨架屏 + B④ 重试态(海天语言) ═══
   已批决议 2026-07-09:
   - 骨架 1.2s 低对比,沿用海天风格容器(玻璃感 + 海蓝半透块),非通用灰骨架。
   - 形态裁决:五板首屏加载统一换骨架(含已有 loading 态的四板)。
   .sk-skel 见 styles/globals.css:纯透明度呼吸、无位移,守晕动症红线 + prefers-reduced-motion 兜底。 */

/** 骨架块(海蓝半透 + 低对比呼吸)。w/h 用 tailwind class 传,或 style 精确控。 */
export function Skel({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn('sk-skel', className)} style={style} aria-hidden />
}

/** 一行骨架文字(可指定条数/宽度收敛,末行短) */
export function SkelLines({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2.5', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skel key={i} className="h-3" style={{ width: i === rows - 1 ? '52%' : i % 2 ? '78%' : '92%' }} />
      ))}
    </div>
  )
}

/**
 * 板级骨架:一块 eyebrow + 巨号占位 + 若干卡骨架,撑满板面。
 * 各板首屏 loading 时统一渲染,保持构图占位不跳动(1.2s 后被真数据替换)。
 * variant 决定占位排布贴合各板构图。
 */
export function BoardSkeleton({
  eyebrow,
  variant = 'stack',
}: {
  eyebrow: string
  variant?: 'stack' | 'grid' | 'mono'
}) {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-[26px] px-16 pb-[90px]" data-in>
      <Label>{eyebrow}</Label>

      {variant === 'mono' && (
        <>
          {/* 数据基地:巨号纪念碑构图占位 */}
          <div className="flex items-end gap-[38px]">
            <Skel style={{ width: 260, height: 118 }} />
            <div className="flex gap-10 pb-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-2.5">
                  <Skel className="h-6" style={{ width: 64 }} />
                  <Skel className="h-2.5" style={{ width: 88 }} />
                </div>
              ))}
            </div>
          </div>
          <Skel className="h-11" style={{ width: '68%' }} />
          <div className="flex gap-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skel key={i} style={{ width: 92, height: 60 }} />
            ))}
          </div>
        </>
      )}

      {variant === 'stack' && (
        <>
          <Skel style={{ width: '46%', height: 40 }} />
          <div className="grid grid-cols-2 gap-3.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sk-hairline-top relative flex flex-col gap-3 rounded-skcard border-[0.5px] border-sk-border bg-sk-card px-[22px] py-[18px] backdrop-blur-[12px]">
                <Skel className="h-3.5" style={{ width: '40%' }} />
                <SkelLines rows={3} />
              </div>
            ))}
          </div>
        </>
      )}

      {variant === 'grid' && (
        <div
          className="grid min-h-0 flex-1 gap-3.5"
          style={{ gridTemplateColumns: '1fr 1fr 1.35fr', gridTemplateRows: '1.22fr 0.78fr', gridTemplateAreas: "'a b c' 'd d c'" }}
        >
          {(['a', 'b', 'c', 'd'] as const).map((area) => (
            <div
              key={area}
              style={{ gridArea: area }}
              className="sk-hairline-top relative flex flex-col gap-3 overflow-hidden rounded-skcard border-[0.5px] border-sk-border bg-sk-card px-[22px] py-[18px] backdrop-blur-[12px]"
            >
              <Skel className="h-3.5" style={{ width: '38%' }} />
              <SkelLines rows={area === 'c' ? 5 : 3} className="mt-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 重试态(B④):数据加载失败时的诚实呈现——错误如实 + 一键重试。
 * 错误≠空库(封板可信度铁律);retry 触发对应 hook 的 reload()。
 */
export function RetryState({
  message,
  onRetry,
  busy,
  className,
}: {
  message: string
  onRetry: () => void
  busy?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      <div className="font-skcjk text-[12.5px] font-light leading-relaxed text-sk-risk">{message}</div>
      <GhostButton onClick={onRetry} disabled={busy}>
        {busy ? '重新加载中…' : '重试 ↻'}
      </GhostButton>
    </div>
  )
}

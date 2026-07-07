import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/cn'
import { CardHead, HeadNote } from './GlassCard'

interface PopoverProps {
  open: boolean
  onClose: () => void
  title: string
  note?: string
  /** 锚点定位类(调用方给 top/bottom/left/right) */
  className?: string
  children: ReactNode
}

/**
 * 锚点浮层(母版 .pop):挂在触发元素旁,点外面关闭。
 * 首屏收纳原则(P0-4)的载体——长列表进浮层不占首屏。
 */
export function Popover({ open, onClose, title, note, className, children }: PopoverProps) {
  useEffect(() => {
    if (!open) return
    const close = () => onClose()
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className={cn(
        'absolute z-skpop min-w-[300px] rounded-[14px] border-[0.5px] border-sk-border bg-sk-heavy p-3 px-4 shadow-skpop backdrop-blur-[16px]',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <CardHead title={title} slim />
        {note && (
          <span className="ml-auto">
            <HeadNote>{note}</HeadNote>
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

interface DropItem {
  label: string
  st?: string
  cur?: boolean
  onSelect: () => void
}

/**
 * 下拉菜单(母版 .pdrop):项目切换/模型选择/智能体选择共用。
 * 展开层 Portal 到 stage 内浮层根 #sk-overlay——脱离调用方(如标题 data-in)因入场动画残留 transform
 * 生成的层叠上下文,避免被后续毛玻璃卡片按 DOM 序覆盖(z-index 数值在被困上下文内无效)。
 * 定位:按触发元素 getBoundingClientRect 换算进浮层根坐标(除以流体舞台 scale),resize/scroll 跟随。
 */
export function DropMenu({
  open,
  items,
  className,
  placement = 'bottom-left',
  gap = 16,
}: {
  open: boolean
  items: DropItem[]
  className?: string
  /** bottom-left=左对齐下拉;top-right=右对齐上弹 */
  placement?: 'bottom-left' | 'top-right'
  gap?: number
}) {
  const markerRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; transform?: string } | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const anchor = markerRef.current?.parentElement
    const overlay = document.getElementById('sk-overlay')
    if (!anchor || !overlay) return
    const compute = () => {
      const o = overlay.getBoundingClientRect()
      const k = o.width / overlay.offsetWidth || 1 /* 抵消流体舞台 scale(k):屏幕坐标→浮层根逻辑坐标 */
      const a = anchor.getBoundingClientRect()
      const L = (a.left - o.left) / k
      const R = (a.right - o.left) / k
      const T = (a.top - o.top) / k
      const B = (a.bottom - o.top) / k
      setPos(
        placement === 'top-right'
          ? { left: R, top: T - gap, transform: 'translate(-100%, -100%)' } /* 右对齐上弹 */
          : { left: L, top: B + gap } /* 左对齐下拉 */,
      )
    }
    compute()
    addEventListener('resize', compute)
    addEventListener('scroll', compute, true)
    return () => {
      removeEventListener('resize', compute)
      removeEventListener('scroll', compute, true)
    }
  }, [open, placement, gap])

  /* 就地隐形锚点:始终挂在调用方 relative 容器内,供测量触发元素位置(菜单本体 Portal 出去后无法自测) */
  const marker = <span ref={markerRef} aria-hidden className="pointer-events-none absolute h-0 w-0" />
  const overlay = open ? document.getElementById('sk-overlay') : null
  if (!open || !pos || !overlay) return marker

  return (
    <>
      {marker}
      {createPortal(
        <div
          className={cn(
            'pointer-events-auto absolute z-skdrop min-w-[210px] rounded-[14px] border-[0.5px] border-sk-border bg-sk-heavy p-2 text-left shadow-skpop backdrop-blur-[16px]',
            className,
          )}
          style={{ left: pos.left, top: pos.top, transform: pos.transform }}
        >
          {items.map((it) => (
            <div
              key={it.label}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-[9px] px-3.5 py-2.5 font-skcjk text-[13.5px] font-light tracking-[0.08em] text-sk-muted transition-colors duration-150 hover:bg-[rgba(127,179,207,.08)] hover:text-sk-fg',
                it.cur && 'text-sk-primary',
              )}
              onClick={(e) => {
                e.stopPropagation()
                it.onSelect()
              }}
            >
              {it.label}
              {it.st && <span className="ml-auto text-[10px] tracking-[0.14em] text-sk-muted2">{it.st}</span>}
            </div>
          ))}
        </div>,
        overlay,
      )}
    </>
  )
}

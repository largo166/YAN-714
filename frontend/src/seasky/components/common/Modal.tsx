import { useEffect, type ReactNode } from 'react'

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

/** 下拉菜单(母版 .pdrop):项目切换/模型选择/智能体选择共用 */
export function DropMenu({ open, items, className }: { open: boolean; items: DropItem[]; className?: string }) {
  if (!open) return null
  return (
    <div
      className={cn(
        'absolute z-skdrop min-w-[210px] rounded-[14px] border-[0.5px] border-sk-border bg-sk-heavy p-2 text-left shadow-skpop backdrop-blur-[16px]',
        className,
      )}
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
    </div>
  )
}

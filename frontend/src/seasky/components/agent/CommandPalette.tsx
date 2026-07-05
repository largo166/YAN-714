import { useEffect, useMemo, useRef, useState } from 'react'

import type { Skill } from '@/types/schemas'

import { cn } from '../../lib/cn'

/* ═══ 命令面板(ADR-001:能力总线的『确认基座』)═══
   composer 的 / 触发,type-to-filter 列出全部技能(+斜杠命令别名),显式点选。
   点选 = 预填(把技能交回营地待确认执行),永不静默执行。b2 构图冻结:面板是叠加浮层。 */

/* 斜杠命令别名(与后端 skills.py _COMMANDS 对齐;confirm=花钱/需确认) */
const SLASH_ALIASES: Record<string, { cmd: string; confirm?: boolean }> = {
  ppt: { cmd: '/ppt' },
  meeting: { cmd: '/纪要' },
  review: { cmd: '/评审' },
  task: { cmd: '/任务' },
  compete: { cmd: '/竞品' },
  concept: { cmd: '/概念' },
  compare: { cmd: '/比选' },
  img: { cmd: '/出图', confirm: true },
}

const NATURE_LABEL: Record<string, string> = {
  概念与方案: '生成', 竞品与研究: '检索', 文本与汇报: '生成', 出图与表现: '生成', 审查与合规: '评审',
}

export interface PaletteItem {
  skillId: string
  title: string
  desc: string
  category: string
  slash?: string
  confirm?: boolean
}

export function CommandPalette({
  open,
  cats,
  onPick,
  onClose,
}: {
  open: boolean
  cats: [string, Skill[]][]
  onPick: (item: PaletteItem) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = []
    for (const [cat, skills] of cats) {
      for (const s of skills) {
        const alias = SLASH_ALIASES[s.id]
        list.push({ skillId: s.id, title: s.title, desc: s.source || NATURE_LABEL[cat] || '', category: cat, slash: alias?.cmd, confirm: alias?.confirm })
      }
    }
    return list
  }, [cats])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase().replace(/^\//, '')
    if (!kw) return items
    return items.filter(
      (it) => it.title.toLowerCase().includes(kw) || it.skillId.toLowerCase().includes(kw) || (it.slash || '').toLowerCase().includes(kw) || it.category.includes(kw),
    )
  }, [items, q])

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [q])

  if (!open) return null

  const commit = (it: PaletteItem | undefined) => {
    if (!it) return
    onPick(it)
  }

  return (
    <div
      className="absolute inset-0 z-skoverlay flex items-start justify-center bg-[rgba(6,8,10,.5)] pt-[14vh] backdrop-blur-[6px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-[min(560px,90%)] overflow-hidden rounded-skcomposer border-[0.5px] border-sk-border bg-[rgba(10,12,14,.96)] shadow-skpop">
        <div className="flex items-center gap-2.5 border-b-[0.5px] border-sk-hairsoft px-4 py-3">
          <span className="font-skmono text-[15px] text-sk-primary">/</span>
          <input
            ref={inputRef}
            className="min-w-0 flex-1 border-0 bg-transparent font-skcjk text-[14px] font-light tracking-[0.04em] text-sk-fg outline-none placeholder:text-sk-muted2"
            placeholder="输入以筛选能力(如 纪要 / 评审 / 生图)…选中即预填,回车确认再执行"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              else if (e.key === 'Enter') { e.preventDefault(); commit(filtered[active]) }
              else if (e.key === 'Escape') { e.preventDefault(); onClose() }
            }}
          />
          <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-sk-muted2">{filtered.length} 项</span>
        </div>
        <div className="sk-scroll max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center font-skcjk text-[12.5px] font-light text-sk-muted2">没有匹配的能力。</div>
          )}
          {filtered.map((it, i) => (
            <button
              key={it.skillId}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100',
                i === active ? 'bg-[rgba(127,179,207,.12)]' : 'hover:bg-[rgba(242,241,238,.04)]',
              )}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(it)}
            >
              <span className="min-w-0 flex-1">
                <span className="font-skcjk text-[13.5px] font-normal text-sk-fg">{it.title}</span>
                {it.desc && <span className="ml-2 font-skcjk text-[11px] font-light text-sk-muted2">{it.desc}</span>}
              </span>
              {it.confirm && <span className="flex-none rounded-full border-[0.5px] border-[rgba(201,178,127,.4)] px-2 py-px font-skcjk text-[10px] font-light text-sk-warn">需确认</span>}
              {it.slash && <span className="flex-none font-skmono text-[11px] text-sk-muted2">{it.slash}</span>}
            </button>
          ))}
        </div>
        <div className="border-t-[0.5px] border-sk-hairsoft px-4 py-2 font-skcjk text-[10.5px] font-light tracking-[0.06em] text-sk-muted2">
          ↑↓ 选择 · Enter 预填 · Esc 关闭 —— 选中后在输入框补充要求,回车才执行(改变世界/花钱动作仍单独确认)
        </div>
      </div>
    </div>
  )
}

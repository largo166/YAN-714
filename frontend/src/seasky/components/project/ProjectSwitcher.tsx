import { useEffect, useRef, useState } from 'react'
import { gsap } from '../../lib/gsapSetup'

import { trigWave } from '../../lib/seaUniforms'
import type { useProjectState } from '../../hooks/useProjectState'
import { DropMenu } from '../common/Modal'

type Proj = ReturnType<typeof useProjectState>

/** 项目切换+行内改名(母版 hproj:点名改名/点▾切换;localStorage 由 hook 持久化) */
export function ProjectSwitcher({ proj }: { proj: Proj }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startRename = () => {
    setDraft(proj.current.name)
    setEditing(true)
    setOpen(false)
  }
  const commit = (cancel: boolean) => {
    if (!editing) return
    setEditing(false)
    if (!cancel) proj.renameProject(draft)
  }
  const switchTo = (i: number) => {
    proj.switchProject(i)
    setOpen(false)
    trigWave(0.3, 0.62, 0.08)
    if (nameRef.current) {
      gsap.fromTo(nameRef.current, { y: '112%' }, { y: 0, duration: 0.7, ease: 'premium' })
    }
  }

  return (
    <span className="relative inline-flex items-baseline gap-3.5">
      {editing ? (
        <input
          ref={inputRef}
          className="w-[280px] border-0 border-b-2 border-sk-primary bg-transparent font-skcjk text-[27px] font-light tracking-[0.14em] text-sk-fg outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit(false)
            }
            if (e.key === 'Escape') commit(true)
          }}
          onBlur={() => commit(false)}
        />
      ) : (
        <span className="inline-block cursor-pointer overflow-hidden" title="点击项目名 · 行内改名" onClick={startRename}>
          <span ref={nameRef} className="block">
            {proj.current.name}
          </span>
        </span>
      )}
      <span
        className="cursor-pointer text-[13px] text-sk-muted2 transition-colors duration-200 hover:text-sk-primary"
        title="切换项目"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        ▾
      </span>
      <button
        className="cursor-pointer border-0 bg-transparent p-1 font-skcjk text-[12px] tracking-[0.12em] text-sk-muted2 transition-colors duration-200 hover:text-sk-primary"
        title="重命名项目"
        onClick={(e) => {
          e.stopPropagation()
          startRename()
        }}
      >
        改名
      </button>
      <DropMenu
        open={open}
        className="left-0 top-[calc(100%+16px)] min-w-[310px]"
        items={proj.projects.map((p, i) => ({
          label: p.name,
          st: p.st,
          cur: i === proj.cur,
          onSelect: () => switchTo(i),
        }))}
      />
    </span>
  )
}

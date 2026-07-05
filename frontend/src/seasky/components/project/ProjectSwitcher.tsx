import { useEffect, useRef, useState } from 'react'
import { gsap } from '../../lib/gsapSetup'

import { trigWave } from '../../lib/seaUniforms'
import type { ProjectBridge } from '../../services/projectBridge'
import { DropMenu } from '../common/Modal'

/** 项目切换+行内改名(数据桥真源:GET /api/projects + PUT 改名;localStorage 持久化选择) */
export function ProjectSwitcher({ proj }: { proj: ProjectBridge }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saveErr, setSaveErr] = useState('')
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

  if (proj.loading) return <span className="text-[15px] font-light tracking-[0.14em] text-sk-muted2">项目加载中…</span>
  if (proj.err) return <span className="text-[13px] font-light tracking-[0.08em] text-sk-risk">项目列表加载失败:{proj.err}</span>
  if (!proj.cur) return <span className="text-[15px] font-light tracking-[0.14em] text-sk-muted2">暂无项目 · 到数据基地接入资料后自动建项</span>

  const startRename = () => {
    setDraft(proj.cur!.name)
    setSaveErr('')
    setEditing(true)
    setOpen(false)
  }
  const commit = async (cancel: boolean) => {
    if (!editing) return
    setEditing(false)
    if (cancel) return
    try {
      await proj.renameProject(draft) /* 真 PUT;失败如实显示,不本地假改 */
    } catch (e) {
      setSaveErr(`改名失败:${(e as Error).message}`)
    }
  }
  const switchTo = (id: number) => {
    proj.switchProject(id)
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
              void commit(false)
            }
            if (e.key === 'Escape') void commit(true)
          }}
          onBlur={() => void commit(false)}
        />
      ) : (
        <span className="inline-block cursor-pointer overflow-hidden" title="点击项目名 · 行内改名" onClick={startRename}>
          <span ref={nameRef} className="block">
            {proj.cur.name}
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
      {saveErr && <span className="text-[11px] font-light tracking-[0.04em] text-sk-risk">{saveErr}</span>}
      <DropMenu
        open={open}
        className="left-0 top-[calc(100%+16px)] min-w-[310px]"
        items={proj.projects.map((p) => ({
          label: p.name,
          st: p.status || '',
          cur: p.id === proj.cur!.id,
          onSelect: () => switchTo(p.id),
        }))}
      />
    </span>
  )
}

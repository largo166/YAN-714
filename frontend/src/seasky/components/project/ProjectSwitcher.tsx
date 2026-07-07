import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from '../../lib/gsapSetup'

import { trigWave } from '../../lib/seaUniforms'
import type { ProjectBridge } from '../../services/projectBridge'

/** 项目切换(居中弹窗+滚动列表+搜索) + 行内改名。
 *  数据桥真源:GET /api/projects + PUT 改名;localStorage 持久化选择。
 *  hotfix2:点项目名/▾ 都开选择器(不再是点名字进改名);选择器居中浮层,不压 KPI/卡片;改名走单独按钮。 */
export function ProjectSwitcher({ proj }: { proj: ProjectBridge }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  /* 打开选择器:自动聚焦搜索框 + Esc 关闭 */
  useEffect(() => {
    if (!pickerOpen) return
    setQ('')
    const t = setTimeout(() => searchRef.current?.focus(), 40)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey) }
  }, [pickerOpen])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return kw ? proj.projects.filter((p) => p.name.toLowerCase().includes(kw)) : proj.projects
  }, [q, proj.projects])

  if (proj.loading) return <span className="text-[15px] font-light tracking-[0.14em] text-sk-muted2">项目加载中…</span>
  if (proj.err) return <span className="text-[13px] font-light tracking-[0.08em] text-sk-risk">项目列表加载失败:{proj.err}</span>
  if (!proj.cur) return <span className="text-[15px] font-light tracking-[0.14em] text-sk-muted2">暂无项目 · 到数据基地接入资料后自动建项</span>

  const startRename = () => {
    setDraft(proj.cur!.name)
    setSaveErr('')
    setEditing(true)
    setPickerOpen(false)
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
    setPickerOpen(false)
    trigWave(0.3, 0.62, 0.08)
    if (nameRef.current) {
      gsap.fromTo(nameRef.current, { y: '112%' }, { y: 0, duration: 0.7, ease: 'premium' })
    }
  }

  const overlay = pickerOpen ? document.getElementById('sk-overlay') : null

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
        /* 点项目名 = 打开选择器(不再是改名) */
        <span
          className="inline-flex cursor-pointer items-baseline gap-2 overflow-hidden"
          title="点击切换项目"
          onClick={() => setPickerOpen(true)}
        >
          <span ref={nameRef} className="block">
            {proj.cur.name}
          </span>
          <span className="text-[13px] text-sk-muted2 transition-colors duration-200 group-hover:text-sk-primary">▾</span>
        </span>
      )}
      <button
        className="cursor-pointer border-0 bg-transparent p-1 font-skcjk text-[12px] tracking-[0.12em] text-sk-muted2 transition-colors duration-200 hover:text-sk-primary"
        title="重命名当前项目"
        onClick={(e) => {
          e.stopPropagation()
          startRename()
        }}
      >
        改名
      </button>
      {saveErr && <span className="text-[11px] font-light tracking-[0.04em] text-sk-risk">{saveErr}</span>}

      {/* 居中项目选择器(Portal 到舞台浮层根;scrim 点击关闭;搜索+滚动列表+当前高亮) */}
      {pickerOpen && overlay && createPortal(
        <div
          className="pointer-events-auto absolute inset-0 z-skoverlay flex items-center justify-center"
          style={{ background: 'rgba(6,8,10,.62)', backdropFilter: 'blur(4px)' }}
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="flex max-h-[70%] w-[min(440px,86%)] flex-col overflow-hidden rounded-[16px] border-[0.5px] border-sk-border bg-sk-heavy shadow-skpop"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头:标题 + 关闭 */}
            <div className="flex flex-none items-center justify-between border-b-[0.5px] border-sk-hairsoft px-5 pb-3 pt-4">
              <span className="font-skcjk text-[14px] font-light tracking-[0.14em] text-sk-fg">切换项目</span>
              <button className="cursor-pointer border-0 bg-transparent text-[16px] leading-none text-sk-muted2 transition-colors hover:text-sk-fg" onClick={() => setPickerOpen(false)} title="关闭">✕</button>
            </div>
            {/* 搜索 */}
            <div className="flex-none px-5 pb-2 pt-3">
              <input
                ref={searchRef}
                className="w-full border-0 border-b-[0.5px] border-sk-hairsoft bg-transparent pb-2 font-skcjk text-[13.5px] font-light tracking-[0.06em] text-sk-fg outline-none transition-colors placeholder:text-sk-muted2 focus:border-sk-primary"
                placeholder="搜索项目名…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {/* 滚动列表 */}
            <div className="sk-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {filtered.length === 0 && (
                <div className="px-3 py-6 text-center font-skcjk text-[12.5px] font-light text-sk-muted">无匹配项目。换个关键词试试。</div>
              )}
              {filtered.map((p) => {
                const cur = p.id === proj.cur!.id
                return (
                  <div
                    key={p.id}
                    className={
                      'flex cursor-pointer items-center gap-2.5 rounded-[9px] px-3.5 py-2.5 font-skcjk text-[13.5px] font-light tracking-[0.06em] transition-colors duration-150 ' +
                      (cur ? 'bg-[rgba(127,179,207,.1)] text-sk-primary' : 'text-sk-muted hover:bg-[rgba(127,179,207,.08)] hover:text-sk-fg')
                    }
                    onClick={() => switchTo(p.id)}
                  >
                    {cur && <span className="h-[5px] w-[5px] flex-none rounded-full bg-sk-primary" />}
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {p.status && <span className="flex-none text-[10px] tracking-[0.14em] text-sk-muted2">{p.status}</span>}
                  </div>
                )
              })}
            </div>
            {/* 脚:计数 */}
            <div className="flex-none border-t-[0.5px] border-sk-hairsoft px-5 py-2.5 font-skcjk text-[11px] font-light tracking-[0.1em] text-sk-muted2">
              共 {proj.projects.length} 个项目{q.trim() && ` · 匹配 ${filtered.length}`}
            </div>
          </div>
        </div>,
        overlay,
      )}
    </span>
  )
}

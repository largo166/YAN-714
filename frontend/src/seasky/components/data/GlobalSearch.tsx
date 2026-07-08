import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '@/lib/api'
import type { KnowledgeHit } from '@/types/schemas'

import type { ProjectBridge } from '../../services/projectBridge'
import { GhostButton, Pill } from '../common/PillButton'

/* ═══ P0 检索第一生产力(2026-07-08) · 全局检索浮层 ═══
   Ctrl+K 全局唤起(跨项目入口;b1 板内检索行保留,共用同一 search 通路——禁双源)。
   @语法:仅前端解析成 project_id 传现有通路,不改检索心脏;重名弹选不猜;
   未匹配降级为全库检索并提示。类型分组卡片;reveal 走唯一后端口径(storage_probe)。
   Portal 到 #sk-overlay 覆盖层——锁版首屏零改动。 */

/** @语法解析:'@市庄 总图' → {projTerm:'市庄', rest:'总图'};无@ → {projTerm:null, rest:原文} */
export function parseAtQuery(raw: string): { projTerm: string | null; rest: string } {
  const m = raw.match(/^\s*@(\S+)\s*(.*)$/)
  if (!m) return { projTerm: null, rest: raw.trim() }
  return { projTerm: m[1], rest: (m[2] || '').trim() }
}

/** 项目名匹配:子串命中(大小写不敏感)。返回全部候选——0=未匹配,1=直用,>1=弹选(不猜)。 */
export function matchProjects(term: string, projects: { id: number; name: string }[]): { id: number; name: string }[] {
  const t = term.toLowerCase()
  return projects.filter((p) => p.name.toLowerCase().includes(t))
}

const TYPE_ORDER = ['任务书', '会议纪要', '方案文本', '图纸', '案例', '方法', '其他'] as const

export function GlobalSearch({ open, onClose, proj }: { open: boolean; onClose: () => void; proj: ProjectBridge }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('') /* @降级提示 / 弹选指引 */
  const [candidates, setCandidates] = useState<{ id: number; name: string }[] | null>(null) /* 重名弹选 */
  const [pendingRest, setPendingRest] = useState('')
  const [revealErr, setRevealErr] = useState<Record<number, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      /* 打开即聚焦;重置上次的弹选/提示(检索结果保留,回来还在) */
      setTimeout(() => inputRef.current?.focus(), 30)
      setCandidates(null)
      setNotice('')
    }
  }, [open])

  const runSearch = useCallback(
    async (query: string, projectId?: number, extraNotice = '') => {
      setBusy(true)
      setErr('')
      setHits(null)
      setCandidates(null)
      setNotice(extraNotice)
      try {
        const r = await api.searchKnowledge(query, 24, projectId)
        setHits(r.hits)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const submit = useCallback(() => {
    const raw = q
    if (!raw.trim() || busy) return
    const { projTerm, rest } = parseAtQuery(raw)
    if (!projTerm) {
      void runSearch(raw.trim())
      return
    }
    if (!rest) {
      setNotice('请在项目名后输入关键词,如「@市庄 总图」')
      return
    }
    const matches = matchProjects(projTerm, proj.projects)
    if (matches.length === 1) {
      void runSearch(rest, matches[0].id, `项目「${matches[0].name}」内检索`)
    } else if (matches.length > 1) {
      /* 重名弹选:不猜 */
      setCandidates(matches)
      setPendingRest(rest)
      setHits(null)
      setNotice(`「${projTerm}」匹配到 ${matches.length} 个项目,请选择:`)
    } else {
      /* 未匹配:降级全库并提示 */
      void runSearch(rest, undefined, `未识别项目「${projTerm}」,已按全库检索`)
    }
  }, [q, busy, proj.projects, runSearch])

  const reveal = useCallback(async (h: KnowledgeHit) => {
    setRevealErr((m) => ({ ...m, [h.document_id]: '' }))
    try {
      await api.revealProjectFile(h.project_id, h.project_file_id)
    } catch (e) {
      /* 404=文件缺失(后端带体检指引话术)——如实呈现,不静默 */
      setRevealErr((m) => ({ ...m, [h.document_id]: (e as Error).message }))
    }
  }, [])

  /* 类型分组(TYPE_ORDER 顺序;未知类型归"其他"末尾) */
  const grouped = useMemo(() => {
    if (!hits) return []
    const g = new Map<string, KnowledgeHit[]>()
    for (const h of hits) {
      const t = (TYPE_ORDER as readonly string[]).includes(h.doc_type) ? h.doc_type : '其他'
      if (!g.has(t)) g.set(t, [])
      g.get(t)!.push(h)
    }
    return [...g.entries()].sort(
      (a, b) => (TYPE_ORDER as readonly string[]).indexOf(a[0]) - (TYPE_ORDER as readonly string[]).indexOf(b[0]),
    )
  }, [hits])

  if (!open) return null
  const overlay = document.getElementById('sk-overlay')
  if (!overlay) return null

  return createPortal(
    <div
      className="absolute inset-0 z-skoverlay flex items-start justify-center bg-[rgba(6,8,10,.6)] pt-[9%] backdrop-blur-[7px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-testid="global-search"
    >
      <div className="flex max-h-[76%] w-[min(760px,90%)] flex-col rounded-skcomposer border-[0.5px] border-sk-border bg-[rgba(10,12,14,.96)] p-6 px-7">
        {/* 检索行 */}
        <div className="flex flex-none items-center gap-3 border-b-2 border-sk-hairsoft pb-2.5">
          <input
            ref={inputRef}
            className="flex-1 border-0 bg-transparent font-skcjk text-[17px] font-light tracking-[0.05em] text-sk-fg outline-none placeholder:text-sk-muted2"
            placeholder="全局检索 · @项目名 关键词(如 @市庄 总图) · Enter 检索 · Esc 关闭"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') onClose()
            }}
          />
          <GhostButton pri className="flex-none px-4 py-[6px]" onClick={submit}>
            {busy ? '…' : '检索'}
          </GhostButton>
        </div>

        {/* 提示行(@降级/弹选指引) */}
        {notice && <div className="mt-2 flex-none font-skcjk text-[11.5px] font-light text-sk-warn">{notice}</div>}

        {/* 重名弹选:不猜 */}
        {candidates && (
          <div className="mt-2 flex flex-none flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.id}
                className="cursor-pointer rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-transparent px-4 py-1.5 font-skcjk text-[12px] font-light text-sk-primary transition-colors hover:bg-sk-primary hover:text-[#0a0c0e]"
                onClick={() => void runSearch(pendingRest, c.id, `项目「${c.name}」内检索`)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* 结果区:三态 + 类型分组卡片 */}
        <div className="sk-scroll mt-3 min-h-0 flex-1 overflow-y-auto">
          {busy && <div className="py-3 font-skcjk text-[12.5px] font-light text-sk-muted2">正在全文检索…</div>}
          {err && <div className="py-3 font-skcjk text-[12.5px] font-light text-sk-risk">检索失败:{err}</div>}
          {hits && hits.length === 0 && (
            <div className="py-3 font-skcjk text-[12.5px] font-light text-sk-muted">无命中。可换关键词、去掉 @项目 限定,或先接入更多资料。</div>
          )}
          {!busy && !err && !hits && !candidates && (
            <div className="py-3 font-skcjk text-[12px] font-light text-sk-muted2">
              输入关键词全库检索;「@项目名 关键词」限定单项目;命中可直接打开文件所在位置。
            </div>
          )}
          {grouped.map(([type, list]) => (
            <div key={type} className="mb-4">
              <div className="mb-2 flex items-baseline gap-2 font-skcjk text-[12.5px] font-normal tracking-[0.1em] text-sk-fg">
                {type}
                <span className="font-sans text-[10.5px] font-light text-sk-muted2">{list.length}</span>
              </div>
              {list.map((h) => (
                <div key={h.document_id} className="border-b-[0.5px] border-sk-hairsoft py-2 last:border-b-0">
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-skcjk text-[13px] font-normal text-sk-fg">{h.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-skcjk text-[10.5px] font-light text-sk-muted2">
                        {h.project_name && <span className="text-sk-primary">{h.project_name}</span>}
                        {h.file_type && <span>{h.file_type}</span>}
                        {h.updated_at && <span>{h.updated_at.slice(0, 10)}</span>}
                        {h.locator && <Pill>{h.locator}</Pill>}
                      </div>
                      {h.snippet && (
                        <div className="mt-1 line-clamp-2 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">{h.snippet}</div>
                      )}
                    </div>
                    {h.project_file_id > 0 && (
                      <GhostButton className="flex-none px-3 py-[5px] text-[11px]" onClick={() => void reveal(h)}>
                        打开所在位置
                      </GhostButton>
                    )}
                  </div>
                  {revealErr[h.document_id] && (
                    <div className="mt-1 font-skcjk text-[11px] font-light text-sk-risk">{revealErr[h.document_id]}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 底部 kbd 提示 */}
        <div className="mt-2 flex-none font-sans text-[9.5px] font-light uppercase tracking-[0.2em] text-sk-muted2">
          Ctrl+K 唤起 · @project scope · Esc close
        </div>
      </div>
    </div>,
    overlay,
  )
}

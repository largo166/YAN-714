import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { api } from '@/lib/api'
import type { KnowledgeHit } from '@/types/schemas'

import { LS_KEYS } from '../../lib/constants'
import { lsGet, lsGetJSON, lsSet, lsSetJSON } from '../../lib/storage'
import type { ProjectBridge } from '../../services/projectBridge'
import { GhostButton, Pill } from '../common/PillButton'

/* ═══ P0/P0+ 检索第一生产力 · 全局检索浮层(收敛版,小样已批) ═══
   Ctrl+K 全局唤起(跨项目入口;b1 板内检索行保留,共用同一 search 通路——禁双源)。
   @语法:仅前端解析成 project_id 传现有通路,不改检索心脏;重名弹选不猜(候选卡带
   城市/甲方/阶段,最近选择置顶);未匹配降级为全库检索并提示(例外才说话,无常显状态行)。
   资产卡六要素(项目/类型/格式/文件夹/日期/可定位态)+动作条(打开位置+复制三件套;
   缺失卡只留复制文件名——没有可打开的东西就不给按钮)。Portal 到 #sk-overlay,锁版首屏零改动。 */

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

/* ── P1-5 检索历史(纯前端 localStorage,无后端):最近 8 条检索词,去重、最新在前 ── */
const RECENT_TERMS_MAX = 8

function loadRecentTerms(): string[] {
  const arr = lsGetJSON<string[]>(LS_KEYS.recentSearchTerms)
  return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()).slice(0, RECENT_TERMS_MAX) : []
}

function pushRecentTerm(raw: string): string[] {
  const term = raw.trim()
  if (!term) return loadRecentTerms()
  const prev = loadRecentTerms().filter((s) => s !== term)
  const next = [term, ...prev].slice(0, RECENT_TERMS_MAX)
  lsSetJSON(LS_KEYS.recentSearchTerms, next)
  return next
}

/* P1-1 资料类型 v2:检索分组按建筑语义轴 16 类(design_doc_type);
   旧文档双轨兜底(后端读时已按旧七类映射回填,前端无需再映射)。 */
const TYPE_ORDER = [
  '文本', '演示', '表格', '效果图', '图纸', '模型', '会议', '汇报',
  '案例', '方法', '规范', '合同', '成本', '甲方资料', '现场资料', '其他',
] as const

/* P1-1 手动改类型:可选的 16 类(与后端 doc_type_rules.DESIGN_DOC_TYPES 一致) */
const DOC_TYPE_OPTIONS = TYPE_ORDER

const STAGE_CN: Record<string, string> = {
  brief: '前期', massing: '强排', concept: '概念', scheme: '方案', develop: '深化',
}

async function copyText(text: string): Promise<boolean> {
  /* clipboard 优先;pywebview/权限受限时降级 execCommand(打包实测项) */
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      return true
    } catch {
      return false
    }
  }
}

export function GlobalSearch({ open, onClose, proj }: { open: boolean; onClose: () => void; proj: ProjectBridge }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('') /* 例外才说话:@降级 / 弹选指引 */
  const [candidates, setCandidates] = useState<{ id: number; name: string }[] | null>(null)
  const [pendingRest, setPendingRest] = useState('')
  const [revealErr, setRevealErr] = useState<Record<number, string>>({})
  const [copied, setCopied] = useState('') /* 轻量复制回执:'docid:kind' */
  const [recentTerms, setRecentTerms] = useState<string[]>([]) /* P1-5 最近检索词 */
  const [typeFilter, setTypeFilter] = useState<string | null>(null) /* P1-1 结果后类型过滤(前端,不改检索) */
  const [editingType, setEditingType] = useState<number | null>(null) /* P1-1 正在改类型的 document_id */
  const [typeSaving, setTypeSaving] = useState(false)
  const [typeErr, setTypeErr] = useState<Record<number, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
      setCandidates(null)
      setNotice('')
      setRecentTerms(loadRecentTerms())
    }
  }, [open])

  const runSearch = useCallback(async (query: string, projectId?: number, extraNotice = '') => {
    setBusy(true)
    setErr('')
    setHits(null)
    setCandidates(null)
    setTypeFilter(null) /* 新检索清空类型过滤(P1-1) */
    setNotice(extraNotice)
    try {
      const r = await api.searchKnowledge(query, 24, projectId)
      setHits(r.hits)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [])

  const pickCandidate = useCallback(
    (c: { id: number; name: string }) => {
      lsSet(LS_KEYS.recentSearchProject, String(c.id)) /* 最近选择置顶(P0+-4) */
      void runSearch(pendingRest, c.id, `项目「${c.name}」内检索`)
    },
    [pendingRest, runSearch],
  )

  const submit = useCallback(() => {
    const raw = q
    if (!raw.trim() || busy) return
    const { projTerm, rest } = parseAtQuery(raw)
    if (!projTerm) {
      setRecentTerms(pushRecentTerm(raw)) /* P1-5:记录用户原样检索词 */
      void runSearch(raw.trim())
      return
    }
    if (!rest) {
      setNotice('请在项目名后输入关键词,如「@市庄 总图」')
      return
    }
    setRecentTerms(pushRecentTerm(raw)) /* P1-5:@语法整条记录,便于原样重搜 */
    const matches = matchProjects(projTerm, proj.projects)
    if (matches.length === 1) {
      lsSet(LS_KEYS.recentSearchProject, String(matches[0].id))
      void runSearch(rest, matches[0].id, `项目「${matches[0].name}」内检索`)
    } else if (matches.length > 1) {
      /* 重名弹选:不猜。最近选择置顶。 */
      const recent = lsGet(LS_KEYS.recentSearchProject)
      const sorted = [...matches].sort((a, b) => (String(b.id) === recent ? 1 : 0) - (String(a.id) === recent ? 1 : 0))
      setCandidates(sorted)
      setPendingRest(rest)
      setHits(null)
      setNotice(`「${projTerm}」匹配到 ${matches.length} 个项目,请选择:`)
    } else {
      void runSearch(rest, undefined, `未识别项目「${projTerm}」,已按全库检索`)
    }
  }, [q, busy, proj.projects, runSearch])

  const reveal = useCallback(async (h: KnowledgeHit) => {
    setRevealErr((m) => ({ ...m, [h.document_id]: '' }))
    try {
      await api.revealProjectFile(h.project_id, h.project_file_id)
    } catch (e) {
      setRevealErr((m) => ({ ...m, [h.document_id]: (e as Error).message }))
    }
  }, [])

  const doCopy = useCallback(async (h: KnowledgeHit, kind: 'path' | 'folder' | 'name') => {
    const text = kind === 'path' ? h.abs_path : kind === 'folder' ? h.abs_path.replace(/[\\/][^\\/]+$/, '') : h.title
    if (!text) return
    if (await copyText(text)) {
      setCopied(`${h.document_id}:${kind}`)
      setTimeout(() => setCopied(''), 1500)
    }
  }, [])

  /* P1-5:点历史词 → 回填输入框并原样重搜(@语法一并复原) */
  const runFromHistory = useCallback((term: string) => {
    setQ(term)
    const { projTerm, rest } = parseAtQuery(term)
    setRecentTerms(pushRecentTerm(term)) /* 重搜也置顶 */
    if (!projTerm) { void runSearch(term.trim()); return }
    if (!rest) { void runSearch(term.trim()); return }
    const matches = matchProjects(projTerm, proj.projects)
    if (matches.length === 1) void runSearch(rest, matches[0].id, `项目「${matches[0].name}」内检索`)
    else void runSearch(rest, undefined, matches.length > 1 ? `「${projTerm}」有多个同名项目,已按全库检索(可在框内重选)` : `未识别项目「${projTerm}」,已按全库检索`)
  }, [proj.projects, runSearch])

  const clearHistory = useCallback(() => {
    lsSetJSON(LS_KEYS.recentSearchTerms, [])
    setRecentTerms([])
  }, [])

  /* P1-1 手动改类型:调后端 PATCH(纯元数据写),成功后就地更新该 hit 的 design_doc_type(即时重分组,不重搜)。 */
  const changeDocType = useCallback(async (h: KnowledgeHit, newType: string) => {
    if (newType === (h.design_doc_type || '')) { setEditingType(null); return }
    setTypeSaving(true)
    setTypeErr((m) => ({ ...m, [h.document_id]: '' }))
    try {
      await api.updateKnowledgeDocType(h.document_id, newType)
      setHits((prev) =>
        prev ? prev.map((x) => (x.document_id === h.document_id ? { ...x, design_doc_type: newType } : x)) : prev,
      )
      /* 知识库分类变更 → 广播,数据基地类型带等消费者可刷新(事件命名约定) */
      window.dispatchEvent(new CustomEvent('romai:knowledge-updated'))
      setEditingType(null)
    } catch (e) {
      setTypeErr((m) => ({ ...m, [h.document_id]: (e as Error).message }))
    } finally {
      setTypeSaving(false)
    }
  }, [])

  const grouped = useMemo(() => {
    if (!hits) return []
    const g = new Map<string, KnowledgeHit[]>()
    for (const h of hits) {
      const key = h.design_doc_type || h.doc_type /* 双轨:新轴优先 */
      const t = (TYPE_ORDER as readonly string[]).includes(key) ? key : '其他'
      if (!g.has(t)) g.set(t, [])
      g.get(t)!.push(h)
    }
    return [...g.entries()].sort(
      (a, b) => (TYPE_ORDER as readonly string[]).indexOf(a[0]) - (TYPE_ORDER as readonly string[]).indexOf(b[0]),
    )
  }, [hits])

  /* P1-1 结果后类型过滤(纯前端):typeFilter=null 显全部;否则只显该类分组。chip 计数用全量 grouped(不随过滤变)。 */
  const visibleGroups = useMemo(
    () => (typeFilter ? grouped.filter(([t]) => t === typeFilter) : grouped),
    [grouped, typeFilter],
  )
  const totalHits = useMemo(() => grouped.reduce((n, [, l]) => n + l.length, 0), [grouped])

  if (!open) return null
  const overlay = document.getElementById('sk-overlay')
  if (!overlay) return null

  const projMeta = (id: number) => {
    const p = proj.projects.find((x) => x.id === id) as { city?: string; client?: string; current_stage?: string } | undefined
    if (!p) return ''
    return `${p.city || '—'} · ${p.client || '—'} · ${STAGE_CN[p.current_stage || ''] || p.current_stage || '—'}阶段`
  }

  return createPortal(
    <div
      className="absolute inset-0 z-skoverlay flex items-start justify-center bg-[rgba(6,8,10,.6)] pt-[9%] backdrop-blur-[7px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-testid="global-search"
    >
      <div className="flex max-h-[76%] w-[min(760px,90%)] flex-col rounded-skcomposer border-[0.5px] border-sk-border bg-[rgba(10,12,14,.96)] p-6 px-7">
        {/* 检索行(placeholder 承担 @语法教学,无底部 kbd 行) */}
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

        {/* 提示行:例外才说话(@降级黄字/弹选指引/范围确认) */}
        {notice && <div className="mt-2 flex-none font-skcjk text-[11.5px] font-light text-sk-warn">{notice}</div>}

        {/* 重名弹选候选卡:城市·甲方·阶段;最近置顶带角标 */}
        {candidates && (
          <div className="mt-2.5 flex flex-none flex-wrap gap-2.5">
            {candidates.map((c, i) => {
              const isRecent = i === 0 && String(c.id) === lsGet(LS_KEYS.recentSearchProject)
              return (
                <button
                  key={c.id}
                  className={`cursor-pointer rounded-[12px] border-[0.5px] bg-[rgba(242,241,238,.02)] px-4 py-2.5 text-left ${
                    isRecent
                      ? 'border-[rgba(127,179,207,.5)] shadow-[0_0_12px_rgba(127,179,207,.12)]'
                      : 'border-sk-hair'
                  }`}
                  onClick={() => pickCandidate(c)}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-skcjk text-[13px] font-normal tracking-[0.04em] text-sk-fg">{c.name}</span>
                    {isRecent && (
                      <span className="font-sans text-[8.5px] font-medium uppercase tracking-[0.22em] text-sk-primary">最近</span>
                    )}
                  </div>
                  <div className="mt-1 font-skcjk text-[10.5px] font-light tracking-[0.06em] text-sk-muted2">{projMeta(c.id)}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* 结果区:三态 + 类型分组(命中数在分组头) + 资产卡 */}
        <div className="sk-scroll mt-3 min-h-0 flex-1 overflow-y-auto">
          {busy && <div className="py-3 font-skcjk text-[12.5px] font-light text-sk-muted2">正在全文检索…</div>}
          {err && <div className="py-3 font-skcjk text-[12.5px] font-light text-sk-risk">检索失败:{err}</div>}
          {hits && hits.length === 0 && (
            <div className="py-3 font-skcjk text-[12.5px] font-light text-sk-muted">无命中。可换关键词、去掉 @项目 限定,或先接入更多资料。</div>
          )}
          {!busy && !err && !hits && !candidates && (
            <div className="py-3">
              {/* P1-5 最近检索(纯前端 localStorage):点即原样重搜;可清空 */}
              {recentTerms.length > 0 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-sans text-[9.5px] font-medium uppercase tracking-[0.24em] text-sk-muted2">最近检索</span>
                    <button
                      className="cursor-pointer font-skcjk text-[10.5px] font-light text-sk-muted2 hover:text-sk-primary"
                      onClick={clearHistory}
                    >
                      清空
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentTerms.map((t) => (
                      <button
                        key={t}
                        className="max-w-[220px] cursor-pointer truncate rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-[5px] font-skcjk text-[11.5px] font-light text-sk-muted transition-colors hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                        title={t}
                        onClick={() => runFromHistory(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="font-skcjk text-[12px] font-light text-sk-muted2">
                输入关键词全库检索;「@项目名 关键词」限定单项目;命中可直接打开文件所在位置。
              </div>
            </div>
          )}
          {/* P1-1 类型过滤条:命中跨 ≥2 类时出;点一下只看该类,再点取消 */}
          {hits && hits.length > 0 && grouped.length > 1 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                className={`cursor-pointer rounded-full border-[0.5px] px-3 py-[4px] font-skcjk text-[10.5px] font-light transition-colors ${
                  typeFilter === null
                    ? 'border-[rgba(127,179,207,.5)] text-sk-primary'
                    : 'border-sk-hairsoft text-sk-muted2 hover:text-sk-primary'
                }`}
                onClick={() => setTypeFilter(null)}
              >
                全部 {totalHits}
              </button>
              {grouped.map(([t, list]) => (
                <button
                  key={t}
                  className={`cursor-pointer rounded-full border-[0.5px] px-3 py-[4px] font-skcjk text-[10.5px] font-light transition-colors ${
                    typeFilter === t
                      ? 'border-[rgba(127,179,207,.5)] text-sk-primary'
                      : 'border-sk-hairsoft text-sk-muted2 hover:text-sk-primary'
                  }`}
                  onClick={() => setTypeFilter((cur) => (cur === t ? null : t))}
                >
                  {t} {list.length}
                </button>
              ))}
            </div>
          )}
          {visibleGroups.map(([type, list]) => (
            <div key={type} className="mb-4">
              <div className="mb-2 flex items-baseline gap-2 font-skcjk text-[12.5px] font-normal tracking-[0.1em] text-sk-fg">
                {type}
                <span className="font-sans text-[10.5px] font-light text-sk-muted2">{list.length}</span>
              </div>
              {list.map((h) => {
                const missing = h.locate_status === '文件缺失' || h.locate_status === '路径异常'
                const locatable = h.locate_status === '可定位'
                return (
                  <div key={h.document_id} className="border-b-[0.5px] border-sk-hairsoft py-2.5 last:border-b-0">
                    {/* 资产卡六要素:标题 / 项目·类型·格式·文件夹·日期·可定位态 */}
                    <div className="truncate font-skcjk text-[13px] font-normal text-sk-fg">{h.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-skcjk text-[10.5px] font-light text-sk-muted2">
                      {h.project_name && <span className="text-sk-primary">{h.project_name}</span>}
                      {/* P1-1 类型:点一下改(下拉 16 类);纯元数据写,改完就地重分组 */}
                      {editingType === h.document_id ? (
                        <select
                          autoFocus
                          disabled={typeSaving}
                          defaultValue={h.design_doc_type || h.doc_type || '其他'}
                          className="rounded-[6px] border-[0.5px] border-[rgba(127,179,207,.5)] bg-[rgba(10,12,14,.9)] px-1.5 py-[1px] font-skcjk text-[10.5px] text-sk-primary outline-none"
                          onChange={(e) => void changeDocType(h, e.target.value)}
                          onBlur={() => setEditingType(null)}
                        >
                          {DOC_TYPE_OPTIONS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          className="cursor-pointer border-b border-dashed border-transparent hover:border-sk-muted2 hover:text-sk-primary"
                          title="点击改资料类型"
                          onClick={() => { setEditingType(h.document_id); setTypeErr((m) => ({ ...m, [h.document_id]: '' })) }}
                        >
                          {h.design_doc_type || h.doc_type || '未分类'} ✎
                        </button>
                      )}
                      {h.file_type && <span>{h.file_type}</span>}
                      {h.folder_hint && <span className="font-skmono text-[10px]">{h.folder_hint}</span>}
                      {h.updated_at && <span>{h.updated_at.slice(0, 10)}</span>}
                      {h.locator && <Pill>{h.locator}</Pill>}
                      {h.locate_status && (
                        <span
                          className={`rounded-full border-[0.5px] px-2 py-[1px] font-sans text-[9px] tracking-[0.1em] ${
                            locatable
                              ? 'border-[rgba(126,201,165,.4)] text-sk-ok'
                              : missing
                                ? 'border-[rgba(207,127,127,.4)] text-sk-risk'
                                : 'border-sk-hair text-sk-muted2'
                          }`}
                        >
                          {h.locate_status}
                        </span>
                      )}
                    </div>
                    {typeErr[h.document_id] && (
                      <div className="mt-1 font-skcjk text-[10.5px] font-light text-sk-risk">改类型失败:{typeErr[h.document_id]}</div>
                    )}
                    {missing ? (
                      <div className="mt-1 font-skcjk text-[11px] font-light text-sk-risk">
                        物理文件不在预期位置——建议到设置页跑一次「库健康体检」。
                      </div>
                    ) : (
                      h.snippet && (
                        <div className="mt-1 line-clamp-2 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">{h.snippet}</div>
                      )
                    )}
                    {/* 动作条:可定位=四动作;缺失=只留复制文件名(不假按钮) */}
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {locatable && h.project_file_id > 0 && (
                        <GhostButton className="flex-none px-3 py-[4px] text-[10.5px]" onClick={() => void reveal(h)}>
                          打开所在位置
                        </GhostButton>
                      )}
                      {locatable && h.abs_path && (
                        <>
                          <button
                            className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-[4px] font-skcjk text-[10.5px] font-light text-sk-muted hover:text-sk-primary"
                            onClick={() => void doCopy(h, 'path')}
                          >
                            {copied === `${h.document_id}:path` ? '已复制 ✓' : '复制文件路径'}
                          </button>
                          <button
                            className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-[4px] font-skcjk text-[10.5px] font-light text-sk-muted hover:text-sk-primary"
                            onClick={() => void doCopy(h, 'folder')}
                          >
                            {copied === `${h.document_id}:folder` ? '已复制 ✓' : '复制文件夹路径'}
                          </button>
                        </>
                      )}
                      <button
                        className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-[4px] font-skcjk text-[10.5px] font-light text-sk-muted hover:text-sk-primary"
                        onClick={() => void doCopy(h, 'name')}
                      >
                        {copied === `${h.document_id}:name` ? '已复制 ✓' : '复制文件名'}
                      </button>
                    </div>
                    {revealErr[h.document_id] && (
                      <div className="mt-1 font-skcjk text-[11px] font-light text-sk-risk">{revealErr[h.document_id]}</div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    overlay,
  )
}

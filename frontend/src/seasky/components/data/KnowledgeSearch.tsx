import { useCallback, useRef, useState, type KeyboardEvent } from 'react'

import { api } from '@/lib/api'
import type { KnowledgeHit } from '@/types/schemas'

import { knowledgeService as ks } from '../../services'
import { Popover } from '../common/Modal'
import { Pill } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* b1 · 大检索行接真(FTS5):结果收敛进锚点浮层(P0-4 首屏收纳,构图零改动)。
   三态:检索中/命中列表/无命中引导,失败显后端原文。
   P0(2026-07-08):与 Ctrl+K 全局浮层共用同一 search 通路(禁双源)——b1 偏"就地确认
   已入库/能查到/已归位";命中带 reveal(打开所在位置,唯一口径)。 */

export function KnowledgeSearch() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
  const [revealErr, setRevealErr] = useState<Record<number, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)

  const doSearch = useCallback(async () => {
    const query = q.trim()
    if (!query || busy) return
    setBusy(true); setErr(''); setOpen(true); setHits(null)
    try {
      const r = await ks.search(query, 8)
      setHits(r.hits)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [q, busy])

  const reveal = useCallback(async (h: KnowledgeHit) => {
    setRevealErr((m) => ({ ...m, [h.document_id]: '' }))
    try {
      await api.revealProjectFile(h.project_id, h.project_file_id)
    } catch (e) {
      setRevealErr((m) => ({ ...m, [h.document_id]: (e as Error).message }))
    }
  }, [])

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void doSearch()
    }
  }

  return (
    <div className="sk-cmdline relative flex max-w-[660px] items-center gap-3.5 border-b-2 border-sk-hairsoft px-0.5 pb-2.5 pt-1.5" data-in>
      <input
        ref={inputRef}
        className="flex-1 border-0 bg-transparent font-skcjk text-[16.5px] font-light tracking-[0.06em] text-sk-fg outline-none placeholder:text-sk-muted2"
        placeholder="搜索已入库资料(关键词 / 编号 / 中文短语)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
      />
      <button
        className="cursor-pointer rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-transparent px-[18px] py-[7px] font-sans text-[10px] font-medium uppercase tracking-[0.24em] text-sk-primary transition-colors duration-200 hover:bg-sk-primary hover:text-[#0a0c0e]"
        onClick={() => void doSearch()}
      >
        {busy ? '…' : 'Search'}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        title={busy ? '检索中…' : `检索「${q.trim()}」`}
        note={hits ? `FTS5 · 命中 ${hits.length}` : undefined}
        className="max-h-[300px] overflow-y-auto sk-scroll"
      >
        {busy && <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-muted2">正在全文检索…</div>}
        {err && <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-risk">检索失败:{err}</div>}
        {hits && hits.length === 0 && (
          <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-muted">无命中。可换关键词,或先接入更多资料。</div>
        )}
        {hits?.map((h, i) => (
          <div key={i} className="border-b-[0.5px] border-sk-hairsoft py-1.5 last:border-b-0">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <MRow
                  compact
                  noBorder
                  lead={h.locator ? <Pill>{h.locator.length > 10 ? h.locator.slice(0, 10) + '…' : h.locator}</Pill> : undefined}
                  text={`${h.title}${h.snippet ? ` — ${h.snippet.slice(0, 60)}` : ''}`}
                />
              </div>
              {h.project_file_id > 0 && (
                <button
                  className="flex-none cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-2.5 py-[3px] font-skcjk text-[10.5px] font-light text-sk-muted transition-colors hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                  onClick={() => void reveal(h)}
                >
                  打开位置
                </button>
              )}
            </div>
            {revealErr[h.document_id] && (
              <div className="font-skcjk text-[10.5px] font-light text-sk-risk">{revealErr[h.document_id]}</div>
            )}
          </div>
        ))}
      </Popover>
    </div>
  )
}

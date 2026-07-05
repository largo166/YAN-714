import { useCallback, useRef, useState, type KeyboardEvent } from 'react'

import type { KnowledgeHit } from '@/types/schemas'

import { knowledgeService as ks } from '../../services'
import { Popover } from '../common/Modal'
import { Pill } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* b1 · 大检索行接真(FTS5):结果收敛进锚点浮层(P0-4 首屏收纳,构图零改动)。
   三态:检索中/命中列表/无命中引导,失败显后端原文。 */

export function KnowledgeSearch() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState(false)
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
        className="left-0 right-[-2px] top-[calc(100%+10px)] max-h-[300px] overflow-y-auto sk-scroll"
      >
        {busy && <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-muted2">正在全文检索…</div>}
        {err && <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-risk">检索失败:{err}</div>}
        {hits && hits.length === 0 && (
          <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-muted">无命中。可换关键词,或先接入更多资料。</div>
        )}
        {hits?.map((h, i) => (
          <MRow
            key={i}
            compact
            lead={h.locator ? <Pill>{h.locator.length > 10 ? h.locator.slice(0, 10) + '…' : h.locator}</Pill> : undefined}
            text={`${h.title}${h.snippet ? ` — ${h.snippet.slice(0, 60)}` : ''}`}
          />
        ))}
      </Popover>
    </div>
  )
}

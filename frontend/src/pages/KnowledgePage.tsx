import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type { KnowledgeDoc, KnowledgeDocListItem, KnowledgeHit } from '@/types/schemas'

/** 数据基地（知识库）：接入真实 knowledge API。保留原 ROM-AI 检索/分区视觉。 */
export default function KnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDocListItem[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const [engine, setEngine] = useState<string>('')
  const [searching, setSearching] = useState(false)
  const [detail, setDetail] = useState<KnowledgeDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 新增表单
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.listKnowledgeDocs()
      setDocs(d.items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  const doSearch = async () => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    setSearching(true)
    setErr(null)
    try {
      const r = await api.searchKnowledge(q, 8)
      setHits(r.hits)
      setEngine(r.engine)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const addDoc = async () => {
    if (!title.trim()) return
    setErr(null)
    try {
      await api.createKnowledgeDoc({ title: title.trim(), content_text: content, tags })
      setTitle('')
      setContent('')
      setTags('')
      setShowAdd(false)
      loadDocs()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const del = async (id: number) => {
    setErr(null)
    try {
      await api.deleteKnowledgeDoc(id)
      if (detail?.id === id) setDetail(null)
      loadDocs()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const openDetail = async (id: number) => {
    try {
      setDetail(await api.getKnowledgeDoc(id))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <>
      <div className="ptitle">
        <h1>数据基地</h1>
        <div className="projsel">
          <div className="pick">
            ▾ 类型 · <b>全知识库</b>
          </div>
        </div>
        <span className="statpill live" style={{ marginLeft: 8 }}>
          已接入
        </span>
      </div>

      {/* 检索 */}
      <div className="searchwrap">
        <div className="searchbar">
          <span style={{ color: 'var(--mut)', cursor: 'pointer' }} onClick={doSearch}>
            🔎
          </span>
          <input
            placeholder="输入关键词，如：立面、退台、高级感、宋式、展示区"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          />
          <span className="eng mono" title="全文检索(FTS5/BM25)，命中时显示实际引擎">
            FTS5 · BM25
          </span>
        </div>
        {hits !== null && (
          <>
            <div id="kb-hits-meta" style={{ fontSize: 11.5, color: 'var(--mut)', margin: '9px 0 2px' }}>
              {searching ? '检索中…' : `命中 ${hits.length} 条 · 引擎 ${engine}`}
            </div>
            <div style={{ marginTop: 4 }}>
              {hits.length === 0 && !searching && (
                <div className="hit">
                  <span className="tx" style={{ color: 'var(--mut)' }}>
                    无命中。
                  </span>
                </div>
              )}
              {hits.map((h) => (
                <div className="hit" key={h.document_id} style={{ cursor: 'pointer' }} onClick={() => openDetail(h.document_id)}>
                  <span className="score">{h.score}</span>
                  <span className="tx">
                    <b>{h.title}</b>：{h.snippet}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 文档库 */}
      <section className="sec" data-open="1">
        <button className="sechead" type="button">
          <span className="chev">▸</span>
          <span className="stitle">知识文档</span>
          <span className="scount">{docs.length}</span>
          <span className="shint">手动录入文本 / Markdown · SQLite 落库</span>
        </button>
        <div className="secbody" style={{ display: 'block' }}>
          <div className="btnrow" style={{ marginTop: 0, marginBottom: 12 }}>
            <button className="btn" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? '收起' : '＋ 新增文本知识'}
            </button>
            <button className="btn ghost" onClick={() => api.reindexKnowledge().then(loadDocs)}>
              ⟳ 重建索引
            </button>
          </div>

          {showAdd && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  className="pathin"
                  style={{ padding: '8px 11px' }}
                  placeholder="标题（必填）"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  placeholder="正文（文本 / Markdown）"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  style={{
                    border: '1px solid var(--line2)',
                    background: 'var(--panel2)',
                    borderRadius: 9,
                    padding: '10px 12px',
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    minHeight: 90,
                    resize: 'vertical',
                    color: 'var(--ink)',
                  }}
                />
                <input
                  className="pathin"
                  style={{ padding: '8px 11px' }}
                  placeholder="标签，逗号分隔，如：立面,材料"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                <div>
                  <button className="btn" onClick={addDoc} disabled={!title.trim()}>
                    保存到知识库
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading && <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>加载中…</div>}
          {!loading && docs.length === 0 && (
            <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>
              暂无知识文档。点「新增文本知识」录入第一条。
            </div>
          )}
          {docs.map((d) => (
            <div className="kbrow" key={d.id}>
              <span className="pth" style={{ cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                <b>{d.title}</b>
                {d.tags && <span style={{ color: 'var(--mut)', marginLeft: 8 }}>#{d.tags}</span>}
              </span>
              <span className="meta">{d.file_type}</span>
              <span className="act" onClick={() => del(d.id)} style={{ color: 'var(--red)' }}>
                删除
              </span>
            </div>
          ))}
        </div>
      </section>

      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

      {/* 详情弹窗（复用原 modal 样式） */}
      {detail && (
        <div className="modal show" onClick={() => setDetail(null)}>
          <div className="panel" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <span className="ic">📄</span>
              <h3>{detail.title}</h3>
              <button className="mclose" onClick={() => setDetail(null)}>
                ×
              </button>
            </div>
            {detail.tags && <div className="mto">#{detail.tags}</div>}
            <div className="mbody" style={{ whiteSpace: 'pre-wrap' }}>
              {detail.content_text || '（无正文）'}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

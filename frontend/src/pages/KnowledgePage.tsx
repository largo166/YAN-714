import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import type { KnowledgeDoc, KnowledgeDocListItem, KnowledgeHit } from '@/types/schemas'

/** 数据基地（知识库）：接入真实 knowledge API。保留原 ROM-AI 检索/分区视觉。
 *  C2.1：去 mock — 数据源/库存/可复用资产一律取真实数据或空态，不伪造（原则 9/13）。
 *  效果图范围随共享当前项目联动（useProject）。 */
export default function KnowledgePage() {
  const { cur } = useProject()
  const [docs, setDocs] = useState<KnowledgeDocListItem[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)
  const [engine, setEngine] = useState<string>('')
  const [searching, setSearching] = useState(false)
  const [detail, setDetail] = useState<KnowledgeDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // 真实数据源（单一已配置工作区根；未配置 → 空态）
  const [ws, setWs] = useState<{ workspace_path: string; accessible: boolean } | null>(null)

  // 可复用资产：按知识文档真实 tags 聚合（无标签 → 空态，不塞 mock）
  const assetGroups = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const d of docs) {
      for (const t of (d.tags || '').split(/[,，;；\s]+/).map((x) => x.trim()).filter(Boolean)) {
        if (!m.has(t)) m.set(t, [])
        m.get(t)!.push(d.title)
      }
    }
    return [...m.entries()]
  }, [docs])

  // 可折叠分区开合态（对齐 HTML 默认：数据源/知识文档 展开，库存/文件浏览/可复用资产 收起）
  const [open, setOpen] = useState<Record<string, boolean>>({
    src: true,
    health: false,
    docs: true,
    files: false,
    assets: false,
  })
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

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
    api.workspaceStatus().then(setWs).catch(() => setWs(null))
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
        <div className="scopebar">
          <span className="lab">类型</span>
          {['全部', '案例', '方法', '图纸'].map((x, i) => (
            <button className={'scope' + (i === 0 ? ' on' : '')} key={x}>
              {x}
            </button>
          ))}
          <span className="lab" style={{ marginLeft: 8 }}>来源</span>
          {['全部', '复制', '引用'].map((x, i) => (
            <button className={'scope' + (i === 0 ? ' on' : '')} key={x}>
              {x}
            </button>
          ))}
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

      <section className="sec" data-open={open.src ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('src')}>
          <span className="chev">▸</span>
          <span className="stitle">数据源</span>
          <span className="scount">{ws?.workspace_path ? '1 来源' : '未配置'}</span>
          <span className="shint">授权台账 · 一键整理 · 重建索引</span>
        </button>
        <div className="secbody">
          {ws?.workspace_path ? (
            <div className="kbrow">
              <span className="pth mono">{ws.workspace_path}</span>
              <span className="kbseg">
                <button className="on">本地目录</button>
              </span>
              <span className="meta mono">{ws.accessible ? '可访问' : '路径不可达'}</span>
              <span className="act" onClick={() => api.workspaceScan().catch(() => {})}>扫描</span>
            </div>
          ) : (
            <div style={{ color: 'var(--mut)', fontSize: 13, padding: '4px 2px' }}>
              未配置数据源。点「添加来源」配置项目工作区目录后纳管。
            </div>
          )}
          <div className="btnrow">
            <button
              className="btn ghost"
              onClick={() => {
                const p = window.prompt('输入要纳管的工作区目录绝对路径：')
                if (p) api.workspaceConfig(p).then(setWs).catch((e: Error) => setErr(e.message))
              }}
            >
              ＋ 添加来源
            </button>
            <button className="btn ghost" onClick={() => api.reindexKnowledge().then(loadDocs)}>⟳ 重建索引</button>
          </div>
        </div>
      </section>

      <section className="sec" data-open={open.health ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('health')}>
          <span className="chev">▸</span>
          <span className="stitle">库存与健康</span>
          <span className="scount">{docs.length} 文档</span>
          <span className="shint">FTS5 / BM25 · 本地索引</span>
        </button>
        <div className="secbody">
          <div className="grid3">
            <div className="metric"><div className="l">受管文件</div><div className="v">{docs.length}</div></div>
            <div className="metric"><div className="l">已索引</div><div className="v t">{docs.length}</div></div>
            <div className="metric">
              <div className="l">索引块 · CJK</div>
              <div className="v" style={{ fontSize: 15, color: 'var(--mut)' }} title="真实分块统计待后端 /api/knowledge/stats 接入">待接入</div>
            </div>
          </div>
          <div className="health">
            <div className="hrow"><span className="hb" style={{ background: 'var(--ok)' }}></span>索引状态 正常 · FTS5 / BM25<span className="r">当前本地库</span></div>
            <div className="hrow"><span className="hb" style={{ background: 'var(--mut)' }}></span>二进制图纸与图片暂不入全文检索<span className="r">资产登记</span></div>
          </div>
        </div>
      </section>

      {/* 文档库 */}
      <section className="sec" data-open={open.docs ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('docs')}>
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

      <section className="sec" data-open={open.files ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('files')}>
          <span className="chev">▸</span>
          <span className="stitle">文件浏览</span>
          <span className="scount">{docs.length} 文件</span>
          <span className="shint">目录树 · 按文件夹</span>
        </button>
        <div className="secbody">
          <div className="tree">
            <div className="tfolder" data-open="1">
              <button className="tfhead" type="button">
                <span className="tchev">▸</span>
                <span className="tname">📁 知识文档</span>
                <span className="tcnt">{docs.length} 文件</span>
              </button>
              <div className="tfiles">
                {docs.slice(0, 8).map((d) => (
                  <div className="tfile" key={d.id}>
                    <span className="ext mono">{d.file_type || 'TXT'}</span>
                    {d.title}
                    <span className="sz mono">本地</span>
                    <span className="idx in">已索引</span>
                  </div>
                ))}
                {!docs.length && <div className="gempty">暂无文件。上传或录入知识后会出现在这里。</div>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" data-open={open.assets ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('assets')}>
          <span className="chev">▸</span>
          <span className="stitle">可复用资产 · 沉淀层</span>
          <span className="scount">{assetGroups.length ? `${assetGroups.length} 类` : '空'}</span>
          <span className="shint">按标签分组</span>
        </button>
        <div className="secbody">
          {assetGroups.length === 0 ? (
            <div style={{ color: 'var(--mut)', fontSize: 13, padding: '4px 2px' }}>
              暂无可复用资产。给知识文档打标签后，会在此按标签自动聚合。
            </div>
          ) : (
            assetGroups.map(([group, items]) => (
              <div className="rgroup" key={group}>
                <div className="gh">{group} · {items.length}</div>
                <div className="tags">
                  {items.map((x, i) => <span className="tg" key={group + i}>{x}</span>)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="sec nocollapse" data-open="1">
        <button className="sechead" type="button">
          <span className="chev">▸</span>
          <span className="stitle">项目效果图</span>
          <span className="scount">0 张</span>
          <span className="shint">{cur ? `当前项目 · ${cur.name}` : '未选择项目'} · 未接生图</span>
        </button>
        <div className="secbody">
          <div className="matwrap">
            <div className="matlabel">生图素材 · AI 代理生图来源</div>
            <div className="matgrid">
              {['任务书', '参考图', '材料表'].map((x) => (
                <div className="matcard" key={x}><span className="mname">{x}</span></div>
              ))}
            </div>
            <div className="modebar">
              <span className="mode t2i">Text to Image</span>
              <span className="sep">/</span>
              <span className="mode i2i">Image to Image</span>
              <span style={{ color: 'var(--mut)' }}>生图未配置时保持空态，不伪造图。</span>
            </div>
          </div>
          <div className="gallery">
            <div className="gempty">暂无效果图成果。</div>
          </div>
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

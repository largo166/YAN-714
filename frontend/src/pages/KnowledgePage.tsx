import { useCallback, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import CrossProjectLibrary from './CrossProjectLibrary'
import type {
  BatchIngestImport,
  BatchIngestPreview,
  KnowledgeDoc,
  KnowledgeDocListItem,
  KnowledgeHit,
  KnowledgeStats,
} from '@/types/schemas'

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
  // 类型筛选：按真实 doc.type 字段（元数据层）。"全部"=不筛。
  const [typeFilter, setTypeFilter] = useState('全部')
  const TYPE_OPTIONS = ['全部', '任务书', '会议纪要', '方案文本', '图纸', '案例', '方法', '其他']
  const docType = (id: number) => docs.find((d) => d.id === id)?.type || ''
  const matchType = (type: string) => typeFilter === '全部' || type === typeFilter
  // 来源筛选：按 resource 的来源项目名（resource = "项目名 / 路径"）。
  const [sourceFilter, setSourceFilter] = useState('全部')
  const sourceProjects = useMemo(() => {
    const set = new Set<string>()
    for (const d of docs) {
      const p = (d.resource || '').split(' / ')[0].trim()
      if (p) set.add(p)
    }
    return [...set]
  }, [docs])
  const docResource = (id: number) => docs.find((d) => d.id === id)?.resource || ''
  const matchSource = (resource: string) =>
    sourceFilter === '全部' || resource.startsWith(sourceFilter)
  // AI 生成元数据：行内 loading + 提示
  const [genningId, setGenningId] = useState<number | null>(null)
  const [metaNote, setMetaNote] = useState<string | null>(null)
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [ingestPreview, setIngestPreview] = useState<BatchIngestPreview | null>(null)
  const [ingestResult, setIngestResult] = useState<BatchIngestImport | null>(null)
  const [ingesting, setIngesting] = useState(false)
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
    api.getKnowledgeStats().then(setStats).catch(() => setStats(null))
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

  // AI 按需生成元数据（description + refine type）。三态：not_configured/no_material/error/ok。
  const genMeta = async (id: number) => {
    if (genningId) return
    setGenningId(id)
    setMetaNote(null)
    try {
      const r = await api.generateDocMetadata(id)
      if (r.status === 'ok') {
        setMetaNote(`已生成：${r.type ? `类型「${r.type}」· ` : ''}${r.description}`)
        loadDocs()
        if (detail?.id === id) setDetail({ ...detail, type: r.type, description: r.description })
      } else if (r.status === 'not_configured') {
        setMetaNote('AI 未配置，请到设置页配置 DeepSeek API Key 后再生成（不会伪造）。')
      } else if (r.status === 'no_material') {
        setMetaNote('该文档无正文，无法生成摘要。')
      } else {
        setMetaNote(`生成失败：${r.error_message || r.message}`)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setGenningId(null)
    }
  }

  const previewBatch = async () => {
    const root = ws?.workspace_path
    if (!root) return
    setErr(null)
    setIngestResult(null)
    try {
      setIngestPreview(await api.previewBatchIngest(root))
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const importBatch = async () => {
    const root = ingestPreview?.root || ws?.workspace_path
    if (!root) return
    const ok = window.confirm('确认批量接入可解析文件？原始目录不会被移动，系统会复制文件并写入项目中心与知识库。')
    if (!ok) return
    setIngesting(true)
    setErr(null)
    try {
      const r = await api.importBatchIngest(root)
      setIngestResult(r)
      await loadDocs()
      api.getKnowledgeStats().then(setStats).catch(() => {})
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setIngesting(false)
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
          {TYPE_OPTIONS.map((x) => (
            <button
              className={'scope' + (typeFilter === x ? ' on' : '')}
              key={x}
              onClick={() => setTypeFilter(x)}
            >
              {x}
            </button>
          ))}
          <span className="lab" style={{ marginLeft: 8 }}>来源</span>
          {/* 来源筛选：按 resource 的来源项目名（resource = "项目名 / 路径"）。
              无 source_mode(复制/引用) 字段，故按来源项目筛选——利用 resource 真实数据，不伪造。 */}
          {['全部', ...sourceProjects].map((x) => (
            <button
              className={'scope' + (sourceFilter === x ? ' on' : '')}
              key={x}
              onClick={() => setSourceFilter(x)}
            >
              {x}
            </button>
          ))}
          {sourceProjects.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--mut)', marginLeft: 4 }}>（暂无来源项目）</span>
          )}
        </div>
        {hits !== null && (
          <>
            {(() => {
              const shown = hits.filter(
                (h) => matchType(docType(h.document_id)) && matchSource(docResource(h.document_id)),
              )
              return (
                <>
                  <div id="kb-hits-meta" style={{ fontSize: 11.5, color: 'var(--mut)', margin: '9px 0 2px' }}>
                    {searching
                      ? '检索中…'
                      : `命中 ${shown.length} 条${typeFilter !== '全部' ? `（已按类型「${typeFilter}」筛选，共 ${hits.length}）` : ''} · 引擎 ${engine}`}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {shown.length === 0 && !searching && (
                      <div className="hit">
                        <span className="tx" style={{ color: 'var(--mut)' }}>
                          {hits.length === 0 ? '无命中。' : `无「${typeFilter}」类型命中。`}
                        </span>
                      </div>
                    )}
                    {shown.map((h) => (
                      <div className="hit" key={h.document_id} style={{ cursor: 'pointer' }} onClick={() => openDetail(h.document_id)}>
                        <span className="score">{h.score}</span>
                        <span className="tx">
                          <b>{h.title}</b>：{h.snippet}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
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
            <button className="btn ghost" onClick={previewBatch} disabled={!ws?.workspace_path}>
              批量接入预览
            </button>
          </div>
          {ingestPreview && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">项目目录批量接入预览</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                识别项目 <b>{ingestPreview.total_projects}</b> 个 · 可接入{' '}
                <b>{ingestPreview.total_supported}</b> 个 · 暂不支持{' '}
                <b>{ingestPreview.total_unsupported}</b> 个
              </div>
              <div style={{ marginTop: 8 }}>
                {ingestPreview.projects.map((p) => (
                  <div className="kbrow" key={p.path}>
                    <span className="pth">{p.project_name}</span>
                    <span className="meta">{p.supported_count} 可接入 / {p.unsupported_count} 不支持</span>
                  </div>
                ))}
              </div>
              <div className="btnrow">
                <button className="btn" onClick={importBatch} disabled={ingesting || ingestPreview.total_supported === 0}>
                  {ingesting ? '接入中…' : '确认导入项目中心 + 知识库'}
                </button>
              </div>
            </div>
          )}
          {ingestResult && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">批量接入结果</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                已复制 <b>{ingestResult.copied}</b> 个 · 已入库 <b>{ingestResult.indexed}</b> 个 · 跳过重复{' '}
                <b>{ingestResult.skipped_existing}</b> 个 · 失败 <b>{ingestResult.failed}</b> 个
              </div>
              <div style={{ marginTop: 8 }}>
                {ingestResult.projects.map((p) => (
                  <div className="kbrow" key={p.project_id}>
                    <span className="pth">{p.project_name}</span>
                    <span className="meta">{p.copied} 复制 / {p.indexed} 入库 / {p.failed} 失败</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            <div className="metric"><div className="l">受管文件</div><div className="v">{stats ? stats.documents : docs.length}</div></div>
            <div className="metric"><div className="l">已索引</div><div className="v t">{stats ? stats.indexed : docs.length}</div></div>
            <div className="metric">
              <div className="l">索引块 · CJK</div>
              <div className="v">{stats ? stats.cjk_chunks : '…'}</div>
            </div>
          </div>
          <div className="health">
            <div className="hrow"><span className="hb" style={{ background: 'var(--ok)' }}></span>索引状态 正常 · {stats ? stats.engine.toUpperCase() : 'FTS5 / BM25'}<span className="r">当前本地库</span></div>
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
            <div className="kbrow" key={d.id} style={{ flexWrap: 'wrap' }}>
              <span className="pth" style={{ cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                {d.type && (
                  <span className="chip" style={{ marginRight: 6, fontSize: 10 }}>{d.type}</span>
                )}
                <b>{d.title}</b>
                {d.tags && <span style={{ color: 'var(--mut)', marginLeft: 8 }}>#{d.tags}</span>}
              </span>
              <span className="meta">{d.file_type}</span>
              <span
                className="act"
                onClick={() => genMeta(d.id)}
                style={{ color: 'var(--terra)', opacity: genningId === d.id ? 0.5 : 1 }}
              >
                {genningId === d.id ? '生成中…' : 'AI 生成元数据'}
              </span>
              <span className="act" onClick={() => del(d.id)} style={{ color: 'var(--red)' }}>
                删除
              </span>
              {d.description && (
                <div style={{ width: '100%', fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>
                  {d.description}
                </div>
              )}
            </div>
          ))}
          {metaNote && (
            <div style={{ fontSize: 12, color: 'var(--mut)', padding: '6px 2px' }}>{metaNote}</div>
          )}
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
            <div className="mto" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {detail.type && <span className="chip">{detail.type}</span>}
              {detail.tags && <span>#{detail.tags}</span>}
              <span className="cspacer" style={{ flex: 1 }}></span>
              <button
                className="anbtn"
                disabled={genningId === detail.id}
                onClick={() => genMeta(detail.id)}
              >
                {genningId === detail.id ? '生成中…' : 'AI 生成元数据'}
              </button>
            </div>
            {detail.description && (
              <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '6px 0', padding: '8px 10px', background: 'var(--panel2)', borderRadius: 8 }}>
                📝 {detail.description}
              </div>
            )}
            {detail.resource && (
              <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 6 }}>来源：{detail.resource}</div>
            )}
            <div className="mbody" style={{ whiteSpace: 'pre-wrap' }}>
              {detail.content_text || '（无正文）'}
            </div>
          </div>
        </div>
      )}
      <CrossProjectLibrary />
    </>
  )
}

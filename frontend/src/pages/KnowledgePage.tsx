import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, type WorkspaceScan } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import { renderInline } from '@/components/RichText'
import CrossProjectLibrary from './CrossProjectLibrary'
import FolderPicker from '@/components/FolderPicker'
import type {
  BatchIngestImport,
  BatchIngestPreview,
  KnowledgeDoc,
  KnowledgeDocListItem,
  KnowledgeStats,
} from '@/types/schemas'

function fmtSize(n: number): string {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB'
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KB'
  return n + ' B'
}

/** 数据基地：本地来源接入 → 一键整理 → 索引展示 的主入口。
 *  两个独立动作:「选择来源」只选择/授权/预览(不落库);「一键整理」才扫描+识别项目+入库+索引+刷新下拉。
 *  全文检索走本地 FTS5 / BM25(SQLite)。所有按钮接真实 API、不伪造、不留无效占位。 */
export default function KnowledgePage() {
  const { cur, reload: reloadProjects, setCurId } = useProject()
  const [switchNote, setSwitchNote] = useState<string | null>(null)
  const [docs, setDocs] = useState<KnowledgeDocListItem[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [genningId, setGenningId] = useState<number | null>(null)
  const [metaNote, setMetaNote] = useState<string | null>(null)
  const [stats, setStats] = useState<KnowledgeStats | null>(null)

  // 选择来源(文件或文件夹):只读预览,不落库。source=当前已选来源;preview/scan=预览数据。
  const [source, setSource] = useState<{ path: string; accessible: boolean } | null>(null)
  const [preview, setPreview] = useState<BatchIngestPreview | null>(null)
  const [scan, setScan] = useState<WorkspaceScan | null>(null) // 仅文件夹有意义的富指标,单文件为 null
  const [lastWsPath, setLastWsPath] = useState('') // prompt 默认值(便利,非"已选择")
  const [selecting, setSelecting] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false) // 目录选择弹窗开关
  // 识别模式:collection=子文件夹各一个项目(默认) | single=整个文件夹作一个项目
  const [mode, setMode] = useState<'collection' | 'single'>('collection')

  // 一键整理:真实落库结果 + 失败标记 + 最近整理时间(用于状态机与结果卡)。
  const [ingesting, setIngesting] = useState(false)
  const [ingestFailed, setIngestFailed] = useState(false)
  const [ingestResult, setIngestResult] = useState<BatchIngestImport | null>(null)
  const [lastIngestAt, setLastIngestAt] = useState<Date | null>(null)

  // 已入库文档:逐条内联展开/折叠(一次只展开一个),展开时按需拉详情(content_text)。
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detailCache, setDetailCache] = useState<Record<number, KnowledgeDoc>>({})

  // 可复用资产:按知识文档真实 tags 聚合(无标签 → 空态,不塞 mock)
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

  // 可折叠分区(库存与健康除外——它默认展开且不可折叠)
  const [open, setOpen] = useState<Record<string, boolean>>({ src: true, docs: false, assets: false })
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      setDocs((await api.listKnowledgeDocs()).items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStats = useCallback(() => {
    api.getKnowledgeStats().then(setStats).catch(() => setStats(null))
  }, [])

  // 当前生效的整理目标根:配置了仓库则显示仓库路径,否则"程序内部目录"。
  // 让用户在「一键整理」前清楚文件会进哪里(消除"以为进 A 实际进 B")。
  const [repoRoot, setRepoRoot] = useState('')

  useEffect(() => {
    loadDocs()
    // 仅取上次工作区路径作 prompt 默认值(便利),不当作"已选择来源"——状态从「未选择」起步。
    api.workspaceStatus().then((w) => setLastWsPath(w.workspace_path || '')).catch(() => {})
    api.getSettings().then((s) => setRepoRoot(s.repository_root_path || '')).catch(() => {})
    loadStats()
  }, [loadDocs, loadStats])

  const del = async (id: number) => {
    setErr(null)
    try {
      await api.deleteKnowledgeDoc(id)
      if (expandedId === id) setExpandedId(null)
      loadDocs()
      loadStats()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  /** 逐条内联展开/折叠(一次一个);展开时若未缓存则拉详情(content_text 用于内容片段)。 */
  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!detailCache[id]) {
      try {
        const d = await api.getKnowledgeDoc(id)
        setDetailCache((m) => ({ ...m, [id]: d }))
      } catch (e) {
        setErr((e as Error).message)
      }
    }
  }

  const genMeta = async (id: number) => {
    if (genningId) return
    setGenningId(id)
    setMetaNote(null)
    try {
      const r = await api.generateDocMetadata(id)
      if (r.status === 'ok') {
        setMetaNote(`已生成：${r.type ? `类型「${r.type}」· ` : ''}${r.description}`)
        loadDocs()
        // 同步刷新已展开详情缓存,展开区即时反映新 type/description
        setDetailCache((m) => (m[id] ? { ...m, [id]: { ...m[id], type: r.type, description: r.description } } : m))
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

  /** 动作一·选择来源:打开目录选择弹窗(后端列目录,点选文件夹或文件,不再手输路径)。 */
  const selectSource = () => {
    if (selecting || ingesting) return
    setPickerOpen(true)
  }

  /** 弹窗选定路径后:只读预览(不落库、不建项目)。原"拿到 path 之后"流程逐字保留。 */
  const onPickSource = async (path: string) => {
    setPickerOpen(false)
    if (!path || !path.trim()) return
    path = path.trim()
    setErr(null)
    setSelecting(true)
    // 选新来源:清掉上次预览/整理结果与失败态(已入库列表不动);模式回默认 collection
    setPreview(null)
    setScan(null)
    setIngestResult(null)
    setIngestFailed(false)
    setMode('collection')
    try {
      // previewBatchIngest 文件/目录通吃;路径不存在 → 后端 400(只读,不改任何数据)
      const pv = await api.previewBatchIngest(path)
      setSource({ path, accessible: true })
      setPreview(pv)
      setLastWsPath(path)
      // best-effort:仅文件夹有意义的富指标(类型分布/大文件);单文件会失败 → 忽略,用 preview 即可
      try {
        const w = await api.workspaceConfig(path)
        if (w.accessible) setScan(await api.workspaceScan())
      } catch {
        /* 单文件或不可配置为工作区:跳过富指标 */
      }
    } catch (e) {
      setSource(null)
      setErr(`无法读取来源：${(e as Error).message}`)
    } finally {
      setSelecting(false)
    }
  }

  /** 动作二·一键整理:对当前已选来源执行扫描+识别项目+复制接入+建索引(真实写库)。 */
  const organize = async () => {
    if (ingesting) return
    if (!source) {
      window.alert('请先选择文件或文件夹')
      return
    }
    // 按当前选中模式判断可接入数(集合/单项目各算各的)
    const sel = mode === 'single' ? preview?.single_project : preview?.collection
    const supported = sel ? sel.total_supported : preview?.total_supported ?? 0
    if (preview && supported === 0) {
      window.alert('当前来源没有可解析/可接入的文件，请重新选择来源。')
      return
    }
    setIngesting(true)
    setIngestFailed(false)
    setErr(null)
    try {
      const r = await api.importBatchIngest(source.path, mode)
      // 先把新项目灌入共享上下文,再渲染结果卡——卡上「设为当前项目」点击不会被 reload 回落覆盖(消除竞态)
      await reloadProjects()
      setIngestResult(r)
      setLastIngestAt(new Date())
      setSwitchNote(`本次整理识别并接入 ${r.total_projects} 个项目，已在「项目中心」下拉出现。`)
      await loadDocs()
      loadStats()
    } catch (e) {
      setIngestFailed(true) // 失败:保留 source,允许再次点击一键整理
      setErr((e as Error).message)
    } finally {
      setIngesting(false)
    }
  }

  // 状态机:未选择 → 已选择,待整理 → 整理中 → 已整理 / 整理失败
  const statusText = ingesting
    ? '整理中…'
    : ingestFailed
      ? '整理失败'
      : ingestResult
        ? '已整理'
        : source
          ? '已选择，待整理'
          : '未选择'

  const topTypes = scan ? Object.entries(scan.type_stats).sort((a, b) => b[1] - a[1]).slice(0, 10) : []
  const busy = selecting || ingesting

  return (
    <>
      <div className="ptitle">
        <h1>数据基地</h1>
        <span className="statpill live" style={{ marginLeft: 8 }}>本地索引 · 已接入</span>
      </div>

      {/* 数据源:两个独立主按钮「选择来源」+「一键整理」+ 状态机 + 只读预览 */}
      <section className="sec" data-open={open.src ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('src')}>
          <span className="chev">▸</span>
          <span className="stitle">数据源 · 选择与整理</span>
          <span className="scount">{statusText}</span>
          <span className="shint">先选择来源 → 再一键整理</span>
        </button>
        <div className="secbody">
          {/* 当前来源 + 状态 */}
          <div className="kbrow" style={{ flexWrap: 'wrap' }}>
            <span className="meta">当前来源：</span>
            {source ? (
              <span className="pth mono">{source.path}</span>
            ) : (
              <span className="meta" style={{ color: 'var(--mut)' }}>未选择</span>
            )}
            <span className="meta" style={{ marginLeft: 12 }}>
              状态：<b style={{ color: ingestFailed ? 'var(--red)' : 'var(--terra)' }}>{statusText}</b>
            </span>
          </div>

          {/* 两个独立主按钮 */}
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="btn" onClick={selectSource} disabled={busy}>
              {selecting ? '读取中…' : '📂 选择来源'}
            </button>
            <button
              className="btn"
              onClick={organize}
              disabled={busy}
              style={{ background: 'var(--terra)', color: '#fff' }}
            >
              {ingesting ? '整理中…' : '⚡ 一键整理'}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mut)', margin: '6px 2px 0' }}>
            「选择来源」只读取并预览本地文件夹或单个文件（不建项目、不入库、不写索引）；确认无误后点「一键整理」才复制接入并建立本地索引。原始目录始终不动。
          </div>
          {/* 当前整理目标根:配置仓库则进仓库,否则程序内部目录(在设置→知识库与数据里配置仓库) */}
          <div style={{ fontSize: 11.5, color: 'var(--mut)', margin: '4px 2px 0' }}>
            整理目标：
            {repoRoot ? (
              <b style={{ color: 'var(--terra)' }}>仓库 {repoRoot}</b>
            ) : (
              <>程序内部目录（默认）· <span style={{ color: 'var(--mut)' }}>可在「设置 → 知识库与数据」配置本地仓库文件夹</span></>
            )}
          </div>

          {/* 只读预览(选择来源后) */}
          {preview && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">来源预览（只读，未移动/未写入任何文件）</div>
              {scan && (
                <div className="grid3" style={{ marginTop: 6 }}>
                  <div className="metric"><div className="l">📄 文件总数</div><div className="v">{scan.total_files}</div></div>
                  <div className="metric"><div className="l">📁 文件夹</div><div className="v">{scan.total_dirs}</div></div>
                  <div className="metric"><div className="l">💾 总大小</div><div className="v" style={{ fontSize: 20 }}>{fmtSize(scan.total_size)}</div></div>
                </div>
              )}
              <div className="grid3" style={{ marginTop: 8 }}>
                <div className="metric"><div className="l">✅ 可解析(待接入)</div><div className="v t">{preview.total_supported}</div></div>
                <div className="metric"><div className="l">⚠ 大文件</div><div className="v">{scan ? scan.large_files.length : '—'}</div></div>
                <div className="metric"><div className="l">⛔ 不可解析</div><div className="v">{preview.total_unsupported}</div></div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)', margin: '6px 2px' }}>
                当前数据基地已入库 <b>{stats?.documents ?? docs.length}</b> 条 · 本次来源可接入 <b>{preview.total_supported}</b> 条（待整理）
              </div>
              {preview.total_supported === 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--red)', margin: '0 2px 6px' }}>
                  该来源没有可解析的文件，点「一键整理」不会接入任何内容；请重新选择来源。
                </div>
              )}

              {/* 识别模式单选:有子文件夹时让用户选「集合/单项目」(不自动猜) */}
              {!preview.is_single_file && preview.mode_hint === 'choose_mode' && (
                <div style={{ margin: '10px 2px', padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>这个文件夹要怎么识别？</div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '4px 0' }}>
                    <input type="radio" name="ingmode" checked={mode === 'collection'} onChange={() => setMode('collection')} />
                    <span style={{ fontSize: 12.5 }}>
                      📚 <b>项目集合</b>：里面装着 <b>{preview.collection?.total_projects ?? preview.total_projects}</b> 个项目(每个子文件夹各算一个项目)
                    </span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', padding: '4px 0' }}>
                    <input type="radio" name="ingmode" checked={mode === 'single'} onChange={() => setMode('single')} />
                    <span style={{ fontSize: 12.5 }}>
                      📦 <b>单个项目</b>：整个文件夹是 <b>1</b> 个项目(子文件夹只是它的资料分类，如 原始资料/项目笔记)
                    </span>
                  </label>
                  <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>
                    只有你知道哪种对——选错可在「设为当前项目」后重选来源重整。
                  </div>
                </div>
              )}

              {/* 识别到的项目/文件夹结构(随所选模式) */}
              {(() => {
                const selp = mode === 'single' ? preview.single_project : preview.collection
                const list = selp ? selp.projects : preview.projects
                const cnt = selp ? selp.total_projects : preview.total_projects
                return list.length > 0 ? (
                  <>
                    <div className="ct" style={{ marginTop: 8 }}>
                      {mode === 'single' ? '将作为 1 个项目接入' : `识别到的项目/文件夹结构（${cnt}）`}
                    </div>
                    {list.map((p) => (
                      <div className="kbrow" key={p.path}>
                        <span className="pth">📁 {p.project_name}</span>
                        <span className="meta">{p.supported_count} 可解析 / {p.unsupported_count} 不支持</span>
                      </div>
                    ))}
                  </>
                ) : null
              })()}

              {/* 文件类型分布(仅文件夹扫描提供) */}
              {topTypes.length > 0 && (
                <>
                  <div className="ct" style={{ marginTop: 8 }}>文件类型分布</div>
                  <div className="tags">
                    {topTypes.map(([ext, n]) => (
                      <span className="tg" key={ext}><span className="k">{ext}</span>{n}</span>
                    ))}
                  </div>
                </>
              )}

              {/* 大文件(秒级元数据登记,不强解析) */}
              {scan && scan.large_files.length > 0 && (
                <>
                  <div className="ct" style={{ marginTop: 8 }}>大文件（登记元数据，不阻塞）</div>
                  {scan.large_files.slice(0, 5).map((f) => (
                    <div className="kbrow" key={f.abs_path}>
                      <span className="pth">{f.path}</span>
                      <span className="meta" style={{ color: 'var(--terra)' }}>{fmtSize(f.size)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* 整理结果卡(一键整理后):字段齐全 + 最近整理时间 + 切换到对应项目 */}
          {ingestResult && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">整理结果 · 识别 {ingestResult.total_projects} 个项目</div>
              <div className="kbrow" style={{ flexWrap: 'wrap' }}>
                <span className="meta">来源：</span><span className="pth mono">{ingestResult.root}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '4px 2px' }}>
                已复制 <b>{ingestResult.copied}</b> · 已入库索引 <b>{ingestResult.indexed}</b> · 可解析{' '}
                <b>{preview?.total_supported ?? ingestResult.copied}</b> · 不可解析/大文件{' '}
                <b>{(preview?.total_unsupported ?? 0) + (scan?.large_files.length ?? 0)}</b> · 跳过重复{' '}
                <b>{ingestResult.skipped_existing}</b> · 失败 <b>{ingestResult.failed}</b>
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)', margin: '0 2px 4px' }}>
                索引状态：{ingestResult.indexed > 0 ? `已建立本地索引（${ingestResult.indexed} 条）` : '本次无新增索引'}
                {lastIngestAt && <> · 最近整理时间：{lastIngestAt.toLocaleString('zh-CN')}</>}
              </div>
              {ingestResult.projects.map((p) => (
                <div className="kbrow" key={p.project_id} style={{ flexWrap: 'wrap' }}>
                  <span className="pth"><b>{p.project_name}</b></span>
                  <span className="meta">{p.copied} 文件 · {p.indexed > 0 ? `已入库 ${p.indexed}` : '未入库'} · 失败 {p.failed}</span>
                  <span
                    className="act"
                    style={{ color: 'var(--terra)' }}
                    onClick={() => { setCurId(p.project_id); setSwitchNote(`已设为当前项目「${p.project_name}」，切到「项目中心」即可看到它的文件 / 认知（按 project_id 隔离）。`) }}
                  >
                    设为当前项目
                  </span>
                </div>
              ))}
              {switchNote && <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 6 }}>{switchNote}</div>}
            </div>
          )}
        </div>
      </section>

      {/* 库存与健康:不可折叠,默认展开——索引状态 / 文件健康 */}
      <section className="sec nocollapse" data-open="1">
        <div className="sechead" style={{ cursor: 'default' }}>
          <span className="chev" style={{ visibility: 'hidden' }}>▸</span>
          <span className="stitle">库存与健康</span>
          <span className="scount">{stats ? stats.documents : docs.length} 文档</span>
          <span className="shint">本地索引 · FTS5 / BM25</span>
        </div>
        <div className="secbody">
          <div className="grid3">
            <div className="metric"><div className="l">受管文件</div><div className="v">{stats ? stats.documents : docs.length}</div></div>
            <div className="metric"><div className="l">已索引</div><div className="v t">{stats ? stats.indexed : docs.length}</div></div>
            <div className="metric"><div className="l">索引块 · CJK</div><div className="v">{stats ? stats.cjk_chunks : '…'}</div></div>
          </div>
          <div className="health">
            <div className="hrow"><span className="hb" style={{ background: 'var(--ok)' }}></span>索引状态 正常 · {stats ? stats.engine.toUpperCase() : 'FTS5 / BM25'}<span className="r">当前本地库</span></div>
            <div className="hrow"><span className="hb" style={{ background: 'var(--mut)' }}></span>二进制图纸与图片登记元数据，暂不入全文检索<span className="r">资产登记</span></div>
          </div>
        </div>
      </section>

      {/* 已入库文档:逐条内联展开/折叠(一次一个) + 单条 AI 元数据 / 删除 */}
      <section className="sec" data-open={open.docs ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('docs')}>
          <span className="chev">▸</span>
          <span className="stitle">已入库文档</span>
          <span className="scount">{docs.length}</span>
          <span className="shint">点条目展开详情 · SQLite 落库</span>
        </button>
        <div className="secbody">
          {loading && <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>加载中…</div>}
          {!loading && docs.length === 0 && (
            <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>
              暂无已入库文档。先「选择来源」再「一键整理」接入本地文件后会出现在这里。
            </div>
          )}
          {docs.map((d) => {
            const expanded = expandedId === d.id
            const det = detailCache[d.id]
            const parseStatus = det ? (det.content_text.trim() ? '已解析入库' : '仅元数据登记') : '加载中…'
            return (
              <div className="rgroup" key={d.id}>
                <div className="kbrow" style={{ flexWrap: 'wrap' }}>
                  <span className="pth" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(d.id)}>
                    <span style={{ color: 'var(--mut)', marginRight: 4 }}>{expanded ? '▾' : '▸'}</span>
                    {d.type && <span className="chip" style={{ marginRight: 6, fontSize: 10 }}>{d.type}</span>}
                    <b>{d.title}</b>
                    {d.tags && <span style={{ color: 'var(--mut)', marginLeft: 8 }}>#{d.tags}</span>}
                  </span>
                  <span className="meta">{d.file_type}</span>
                  <span className="act" onClick={() => genMeta(d.id)} style={{ color: 'var(--terra)', opacity: genningId === d.id ? 0.5 : 1 }}>
                    {genningId === d.id ? '生成中…' : 'AI 生成元数据'}
                  </span>
                  <span className="act" onClick={() => del(d.id)} style={{ color: 'var(--red)' }}>删除</span>
                </div>

                {/* 内联展开详情(真实字段;所属项目暂不显示——知识文档未直接绑定项目) */}
                {expanded && (
                  <div style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: 'var(--panel2)', borderRadius: 8, fontSize: 12.5 }}>
                    <div className="kvline"><span className="kvk">文件名</span>{d.title}</div>
                    <div className="kvline"><span className="kvk">文件类型</span>{d.file_type}{d.type ? ` · ${d.type}` : ''}</div>
                    <div className="kvline"><span className="kvk">来源路径</span><span className="mono" style={{ wordBreak: 'break-all' }}>{d.source_path || '—'}</span></div>
                    <div className="kvline"><span className="kvk">来源说明</span>{d.resource || '—'}</div>
                    <div className="kvline"><span className="kvk">摘要</span>{d.description ? renderInline(d.description) : '（未生成，可点「AI 生成元数据」）'}</div>
                    <div className="kvline"><span className="kvk">入库方式</span>复制接入（原文件不动，系统留受管副本）</div>
                    <div className="kvline"><span className="kvk">解析状态</span>{parseStatus}</div>
                    <div className="kvline" style={{ alignItems: 'flex-start' }}>
                      <span className="kvk">内容片段</span>
                      <span style={{ whiteSpace: 'pre-wrap', color: 'var(--ink2)' }}>
                        {det ? (det.content_text.trim() ? det.content_text.slice(0, 500) + (det.content_text.length > 500 ? ' …' : '') : '（无正文，仅登记元数据）') : '加载中…'}
                      </span>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <button className="anbtn" disabled={genningId === d.id} onClick={() => genMeta(d.id)}>
                        {genningId === d.id ? '生成中…' : 'AI 生成元数据'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {metaNote && <div style={{ fontSize: 12, color: 'var(--mut)', padding: '6px 2px' }}>{metaNote}</div>}
        </div>
      </section>

      {/* 可复用资产:按真实标签聚合(无标签→空态) */}
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
              暂无可复用资产。给文档打标签后，会在此按标签自动聚合。
            </div>
          ) : (
            assetGroups.map(([group, items]) => (
              <div className="rgroup" key={group}>
                <div className="gh">{group} · {items.length}</div>
                <div className="tags">{items.map((x, i) => <span className="tg" key={group + i}>{x}</span>)}</div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* 项目效果图:未接生图时保持空态(不伪造) */}
      <section className="sec nocollapse" data-open="1">
        <div className="sechead" style={{ cursor: 'default' }}>
          <span className="chev" style={{ visibility: 'hidden' }}>▸</span>
          <span className="stitle">项目效果图</span>
          <span className="scount">0 张</span>
          <span className="shint">{cur ? `当前项目 · ${cur.name}` : '未选择项目'} · 未接生图</span>
        </div>
        <div className="secbody">
          <div className="gallery">
            <div className="gempty">暂无效果图成果。生图未配置时保持空态，不伪造图。</div>
          </div>
        </div>
      </section>

      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

      <CrossProjectLibrary />

      <FolderPicker
        open={pickerOpen}
        initialPath={lastWsPath}
        onPick={onPickSource}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}

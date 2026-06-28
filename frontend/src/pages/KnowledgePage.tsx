import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, type FileAsset } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import { renderInline } from '@/components/RichText'
import CrossProjectLibrary from './CrossProjectLibrary'
import type {
  KnowledgeDoc,
  KnowledgeDocListItem,
  KnowledgeStats,
} from '@/types/schemas'

// 选择来源支持的可解析扩展(与后端 parsing.SUPPORTED_EXTS 一致;客户端先筛,跳过 .rar 等)
const SUPPORTED_EXTS = ['.txt', '.md', '.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg']
const isSupportedName = (n: string) => SUPPORTED_EXTS.some((e) => n.toLowerCase().endsWith(e))

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
  const [assets, setAssets] = useState<FileAsset[]>([]) // 从项目文件抽出的图片资产

  // 选择来源(原生对话框):picked=已选可解析文件(客户端筛);projName=整理成的项目名(可编辑)。
  // 浏览器拿不到磁盘路径,改为选文件/文件夹后把可解析文件经本地回环上传接入(复用单文件上传链路)。
  const [picked, setPicked] = useState<{ files: File[]; skipped: number; fromFolder: boolean } | null>(null)
  const [projName, setProjName] = useState('')
  const folderInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)

  // 一键整理:逐文件上传+索引;进度 + 失败标记 + 结果 + 最近整理时间。
  const [ingesting, setIngesting] = useState(false)
  const [ingestFailed, setIngestFailed] = useState(false)
  const [ingestProg, setIngestProg] = useState<{ done: number; total: number } | null>(null)
  const [ingestResult, setIngestResult] = useState<
    { projectName: string; projectId: number; uploaded: number; indexed: number; failed: number; total: number } | null
  >(null)
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

  // 当前项目的图片资产(从文件抽出的图);随项目切换刷新。
  const loadAssets = useCallback(() => {
    if (!cur) {
      setAssets([])
      return
    }
    api.listAssets(cur.id).then((d) => setAssets(d.items)).catch(() => setAssets([]))
  }, [cur])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

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
  // <input webkitdirectory> 是非标准属性,JSX 不认;打开时用 ref 设上,即可选整个文件夹。
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  /** 原生对话框选完(文件夹 or 多选文件)后:客户端筛可解析文件、推断项目名,不落库。 */
  const onNativePicked = (fileList: FileList | null, fromFolder: boolean) => {
    const all = fileList ? Array.from(fileList) : []
    const files = all.filter((f) => isSupportedName(f.name))
    const skipped = all.length - files.length
    setIngestResult(null)
    setIngestFailed(false)
    setErr(null)
    if (files.length === 0) {
      setPicked(null)
      if (all.length) setErr(`所选内容没有可整理的文件（跳过 ${skipped} 个不支持的，如 .rar/.dwg）。`)
      return
    }
    // 项目名:文件夹→顶层文件夹名(webkitRelativePath 首段);多选文件→当前项目名(都可改)
    const rel = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath
    setProjName(fromFolder && rel ? rel.split('/')[0] : cur?.name ?? '')
    setPicked({ files, skipped, fromFolder })
  }

  /** 动作二·一键整理:把已选文件经本地回环逐个上传到目标项目并建索引(复用单文件上传链路)。 */
  const organize = async () => {
    if (ingesting || !picked) return
    const name = projName.trim()
    if (!name) {
      window.alert('请填写要整理成的项目名称')
      return
    }
    if (picked.files.length === 0) {
      window.alert('没有可整理的文件，请重新选择来源。')
      return
    }
    setIngesting(true)
    setIngestFailed(false)
    setErr(null)
    setIngestProg({ done: 0, total: picked.files.length })
    try {
      // 同名项目并入,否则新建(浏览器拿不到源路径,用项目名做去重键)
      const list = await api.listProjects()
      let proj = list.items.find((p) => p.name === name) ?? null
      if (!proj) proj = await api.createProject({ name })
      let uploaded = 0
      let indexed = 0
      let failed = 0
      const uploadedIds: number[] = []
      for (let i = 0; i < picked.files.length; i++) {
        try {
          const pf = await api.uploadProjectFile(proj.id, picked.files[i])
          uploaded++
          uploadedIds.push(pf.id)
          try {
            await api.indexProjectFile(proj.id, pf.id)
            indexed++
          } catch {
            /* 索引失败不致命:文件已接入,可在项目里手动重建索引 */
          }
        } catch {
          failed++
        }
        setIngestProg({ done: i + 1, total: picked.files.length })
      }
      // 先灌共享上下文再渲染结果卡,避免「设为当前项目」被 reload 回落覆盖
      await reloadProjects()
      setIngestResult({ projectName: name, projectId: proj.id, uploaded, indexed, failed, total: picked.files.length })
      setLastIngestAt(new Date())
      setSwitchNote(`已整理「${name}」：接入 ${uploaded} 个文件、索引 ${indexed} 个${failed ? `，失败 ${failed}` : ''}，已在「项目中心」下拉。`)
      await loadDocs()
      loadStats()
      // 后台抽图(不阻塞结果展示):每个文件抽完后刷新图片资产画廊
      const pid = proj.id
      void Promise.all(uploadedIds.map((fid) => api.extractFileAssets(pid, fid).catch(() => null))).then(loadAssets)
    } catch (e) {
      setIngestFailed(true) // 失败:保留 picked,允许重试
      setErr((e as Error).message)
    } finally {
      setIngesting(false)
      setIngestProg(null)
    }
  }

  // 状态机:未选择 → 已选择,待整理 → 整理中 → 已整理 / 整理失败
  const statusText = ingesting
    ? '整理中…'
    : ingestFailed
      ? '整理失败'
      : ingestResult
        ? '已整理'
        : picked
          ? '已选择，待整理'
          : '未选择'

  const busy = ingesting

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
            {picked ? (
              <span className="pth">
                {picked.fromFolder ? '📁 文件夹' : '📄 多选文件'} · {picked.files.length} 个可整理
                {picked.skipped ? `（跳过 ${picked.skipped} 个不支持）` : ''}
              </span>
            ) : (
              <span className="meta" style={{ color: 'var(--mut)' }}>未选择</span>
            )}
            <span className="meta" style={{ marginLeft: 12 }}>
              状态：<b style={{ color: ingestFailed ? 'var(--red)' : 'var(--terra)' }}>{statusText}</b>
            </span>
          </div>

          {/* 原生系统对话框:选文件夹 / 多选文件(隐藏 input,按钮触发) */}
          <input
            ref={folderInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={(e) => { onNativePicked(e.target.files, true); e.target.value = '' }}
          />
          <input
            ref={filesInputRef}
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
            onChange={(e) => { onNativePicked(e.target.files, false); e.target.value = '' }}
          />
          <div className="btnrow" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => folderInputRef.current?.click()} disabled={busy}>
              📁 选择文件夹
            </button>
            <button className="btn" onClick={() => filesInputRef.current?.click()} disabled={busy}>
              📄 选择文件(可多选)
            </button>
            <button
              className="btn"
              onClick={organize}
              disabled={busy || !picked}
              style={{ background: 'var(--terra)', color: '#fff' }}
            >
              {ingesting ? (ingestProg ? `整理中… ${ingestProg.done}/${ingestProg.total}` : '整理中…') : '⚡ 一键整理'}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mut)', margin: '6px 2px 0' }}>
            点「选择文件夹 / 文件」弹出系统对话框（左侧栏可一键到桌面 / 文档 / Downloads）。只接入可解析文件（txt/md/pdf/docx/pptx/xlsx/图片），自动跳过 .rar 等。确认无误后点「一键整理」复制接入并建索引，原始文件不动。
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

          {/* 已选文件预览 + 整理成的项目名(可编辑) */}
          {picked && !ingestResult && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">待整理（{picked.files.length} 个可解析文件，原文件不动）</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 2px' }}>
                <span className="meta">整理成项目：</span>
                <input
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="项目名称"
                  style={{ flex: 1, minWidth: 180, padding: '6px 10px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13 }}
                />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--mut)', margin: '0 2px 6px' }}>
                {picked.fromFolder ? '默认用文件夹名；' : '默认用当前项目名；'}同名项目会并入，否则新建。
                {picked.skipped ? ` 已跳过 ${picked.skipped} 个不支持的文件。` : ''}
              </div>
              {picked.files.slice(0, 10).map((f, i) => (
                <div className="kbrow" key={i}>
                  <span className="pth">📄 {(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}</span>
                  <span className="meta">{fmtSize(f.size)}</span>
                </div>
              ))}
              {picked.files.length > 10 && (
                <div style={{ fontSize: 11.5, color: 'var(--mut)', padding: 4 }}>…等共 {picked.files.length} 个</div>
              )}
            </div>
          )}

          {/* 整理结果卡(一键整理后):接入/索引/失败 + 切换到该项目 */}
          {ingestResult && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">整理结果 · 项目「{ingestResult.projectName}」</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)', margin: '4px 2px' }}>
                接入 <b>{ingestResult.uploaded}</b> 个文件 · 建索引 <b>{ingestResult.indexed}</b> · 失败{' '}
                <b>{ingestResult.failed}</b> / 共 {ingestResult.total}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)', margin: '0 2px 4px' }}>
                索引状态：{ingestResult.indexed > 0 ? `已建立本地索引（${ingestResult.indexed} 条）` : '本次无新增索引'}
                {lastIngestAt && <> · 最近整理时间：{lastIngestAt.toLocaleString('zh-CN')}</>}
              </div>
              <div className="kbrow" style={{ flexWrap: 'wrap' }}>
                <span className="pth"><b>{ingestResult.projectName}</b></span>
                <span
                  className="act"
                  style={{ color: 'var(--terra)' }}
                  onClick={() => { setCurId(ingestResult.projectId); setSwitchNote(`已设为当前项目「${ingestResult.projectName}」，切到「项目中心」即可看到它的文件 / 认知。`) }}
                >
                  设为当前项目
                </span>
              </div>
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

      {/* 项目图片资产:从 PPT/PDF/Word 抽出的图(+ 直接上传图);有才显示,不伪造 */}
      <section className="sec nocollapse" data-open="1">
        <div className="sechead" style={{ cursor: 'default' }}>
          <span className="chev" style={{ visibility: 'hidden' }}>▸</span>
          <span className="stitle">项目图片资产</span>
          <span className="scount">{assets.length} 张</span>
          <span className="shint">{cur ? `当前项目 · ${cur.name}` : '未选择项目'} · 从文件抽取</span>
        </div>
        <div className="secbody">
          {assets.length === 0 ? (
            <div className="gallery">
              <div className="gempty">
                {cur
                  ? '暂无图片资产。上传含图的 PPT/PDF/Word 并「一键整理」后，会自动抽出其中的图。'
                  : '请先选择项目。'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {assets.slice(0, 60).map((a) => (
                <a
                  key={a.id}
                  href={cur ? api.assetImageUrl(cur.id, a.id) : '#'}
                  target="_blank"
                  rel="noreferrer"
                  title={
                    [
                      a.slide_no ? `PPT 第 ${a.slide_no} 页` : a.page_no ? `PDF 第 ${a.page_no} 页` : '',
                      `${a.width}×${a.height}`,
                      a.caption,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }
                  style={{ display: 'block', width: 120, height: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line2)', background: 'var(--panel2)' }}
                >
                  {cur && (
                    <img
                      src={api.assetThumbUrl(cur.id, a.id)}
                      alt={a.caption.slice(0, 20) || '图片资产'}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  )}
                </a>
              ))}
              {assets.length > 60 && (
                <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--mut)', padding: '0 6px' }}>
                  …共 {assets.length} 张
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

      <CrossProjectLibrary />
    </>
  )
}

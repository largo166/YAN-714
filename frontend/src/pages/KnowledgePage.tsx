import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, type FileAsset } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import { renderInline } from '@/components/RichText'
import CrossProjectLibrary from './CrossProjectLibrary'
import type {
  KnowledgeDoc,
  KnowledgeDocListItem,
  KnowledgeHit,
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

// 项目效果图:筛选 tab / 类型中文名 / 生图素材类型 / 可改分类项
const ASSET_TABS = [
  { key: 'all', label: '全部' },
  { key: 'render', label: '效果图' },
  { key: 'reference', label: '参考图' },
  { key: 'plan', label: '图纸/平面' },
  { key: 'model', label: '白模/体块' },
  { key: 'material', label: '材质' },
]
const TYPE_CN: Record<string, string> = {
  render: '效果图', reference: '参考图', plan: '图纸', model: '白模',
  material: '材质', logo: 'logo', extracted: '文档图', image: '图片',
}
const MAT_TYPES = ['reference', 'model', 'material'] // 生图素材类型
const RECLASS = [
  { key: 'render', label: '效果图' }, { key: 'reference', label: '参考图' },
  { key: 'plan', label: '图纸/平面' }, { key: 'model', label: '白模/体块' },
  { key: 'material', label: '材质' }, { key: 'logo', label: 'logo/图标' },
]

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
  const [removed, setRemoved] = useState<FileAsset[]>([]) // 已软移除(trashed)的资产,可恢复
  const [showRemoved, setShowRemoved] = useState(false)
  // 全文搜索:接后端 FTS5/LIKE,命中带页码定位(chunk 溯源)
  const [searchQ, setSearchQ] = useState('')
  const [searchHits, setSearchHits] = useState<KnowledgeHit[] | null>(null)
  const [searchEngine, setSearchEngine] = useState('')
  const [searching, setSearching] = useState(false)

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
  const [open, setOpen] = useState<Record<string, boolean>>({ src: true, inbox: false, docs: false, assets: false })
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
      setRemoved([])
      return
    }
    api.listAssets(cur.id).then((d) => setAssets(d.items)).catch(() => setAssets([]))
    api.listAssets(cur.id, 'trashed').then((d) => setRemoved(d.items)).catch(() => setRemoved([]))
  }, [cur])

  useEffect(() => {
    loadAssets()
  }, [loadAssets])

  // 项目效果图:筛选 tab + 改分类 / 软移除(复用 trashed 语义,可恢复,不删图/源文件)
  const [assetTab, setAssetTab] = useState('all')
  const reclassAsset = async (id: number, asset_type: string) => {
    if (!cur) return
    try { await api.updateAsset(cur.id, id, { asset_type }); loadAssets() } catch (e) { setErr((e as Error).message) }
  }
  const removeAsset = async (id: number) => {
    if (!cur) return
    try { await api.updateAsset(cur.id, id, { status: 'trashed' }); loadAssets() } catch (e) { setErr((e as Error).message) }
  }
  const restoreAsset = async (id: number) => {
    if (!cur) return
    try { await api.updateAsset(cur.id, id, { status: 'active' }); loadAssets() } catch (e) { setErr((e as Error).message) }
  }
  // 图生图(真 img2img):用「素材」资产作参考图生成,完成后新 render 自动进画廊
  const [img2imgPrompt, setImg2imgPrompt] = useState('')
  const [img2imgBusy, setImg2imgBusy] = useState(false)
  const [img2imgMsg, setImg2imgMsg] = useState<string | null>(null)
  const runImg2Img = async (refIds: number[]) => {
    if (!cur || !img2imgPrompt.trim() || refIds.length === 0) return
    setImg2imgBusy(true)
    setImg2imgMsg(null)
    try {
      const r = await api.generateImageFromAssets(cur.id, img2imgPrompt.trim(), refIds)
      if (r.status === 'ok') {
        setImg2imgMsg(`已用 ${refIds.length} 张素材生成（模型 ${r.image_model || '—'}），已归档到下方效果图。`)
        setImg2imgPrompt('')
        loadAssets()
      } else {
        setImg2imgMsg(r.status === 'not_configured' ? '生图未配置（backend/.env 缺 IMAGE_API_KEY）' : (r.content || '生图失败'))
      }
    } catch (e) {
      setImg2imgMsg((e as Error).message)
    } finally {
      setImg2imgBusy(false)
    }
  }

  const doSearch = async () => {
    const q = searchQ.trim()
    if (!q) {
      setSearchHits(null)
      return
    }
    setSearching(true)
    setErr(null)
    try {
      const r = await api.searchKnowledge(q, 8)
      setSearchHits(r.hits)
      setSearchEngine(r.engine)
    } catch (e) {
      setErr((e as Error).message)
      setSearchHits([])
    } finally {
      setSearching(false)
    }
  }

  // 当前生效的整理目标根:配置了仓库则显示仓库路径,否则"程序内部目录"。
  // 让用户在「一键整理」前清楚文件会进哪里(消除"以为进 A 实际进 B")。
  const [repoRoot, setRepoRoot] = useState('')

  // 收件箱监听(P1-C):设一个文件夹,新文件自动入库(后台 60s 轮询 + 此处手动兜底)。
  const [inboxInfo, setInboxInfo] = useState<{ inbox_root_path: string; accessible: boolean; pending: number } | null>(null)
  const [inboxInput, setInboxInput] = useState('')
  const [inboxBusy, setInboxBusy] = useState(false)
  const [inboxMsg, setInboxMsg] = useState<string | null>(null)
  const loadInbox = useCallback(() => {
    api.inboxStatus().then((s) => { setInboxInfo(s); setInboxInput(s.inbox_root_path) }).catch(() => setInboxInfo(null))
  }, [])
  const saveInbox = async () => {
    setInboxBusy(true)
    setInboxMsg(null)
    try {
      const s = await api.inboxConfig(inboxInput.trim())
      setInboxMsg(s.accessible ? '收件箱已设置，新文件将自动入库。' : (inboxInput.trim() ? '路径已存但不可访问，请检查。' : '已清除收件箱。'))
      loadInbox()
    } catch (e) {
      setInboxMsg((e as Error).message)
    } finally {
      setInboxBusy(false)
    }
  }
  const scanInboxNow = async () => {
    setInboxBusy(true)
    setInboxMsg(null)
    try {
      const r = await api.scanInbox()
      setInboxMsg(
        r.accessible
          ? `扫描完成：入库 ${r.imported ?? 0} · 索引 ${r.indexed ?? 0} · 跳过 ${r.skipped ?? 0} · 失败 ${r.failed ?? 0}`
          : (r.reason || '收件箱不可访问'),
      )
      loadInbox()
      loadDocs()
      loadStats()
    } catch (e) {
      setInboxMsg((e as Error).message)
    } finally {
      setInboxBusy(false)
    }
  }

  useEffect(() => {
    loadDocs()
    // 仅取上次工作区路径作 prompt 默认值(便利),不当作"已选择来源"——状态从「未选择」起步。
    api.workspaceStatus().then((w) => setLastWsPath(w.workspace_path || '')).catch(() => {})
    api.getSettings().then((s) => setRepoRoot(s.repository_root_path || '')).catch(() => {})
    loadStats()
    loadInbox()
  }, [loadDocs, loadStats, loadInbox])

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

      {/* 收件箱监听(P1-C):设一个文件夹,新文件自动入库(后台 60s 轮询 + 手动兜底) */}
      <section className="sec" data-open={open.inbox ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('inbox')}>
          <span className="chev">▸</span>
          <span className="stitle">收件箱监听</span>
          {inboxInfo?.accessible && <span className="scount">待处理 {inboxInfo.pending}</span>}
          <span className="shint">设一个文件夹 · 丢进去的文件自动入库</span>
        </button>
        <div className="secbody">
          <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 8 }}>
            把要入库的文件丢进这个文件夹，后台每分钟自动扫描并接入知识库（入库后原件移到该文件夹下的 <code>_done/</code>）。也可随时点「立即扫描」。
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={inboxInput}
              onChange={(e) => setInboxInput(e.target.value)}
              placeholder="收件箱文件夹的完整路径，如 C:\Users\…\ROM-AI收件箱"
              style={{ flex: 1, minWidth: 240, padding: '8px 12px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13, background: 'var(--panel2)', color: 'var(--ink)' }}
            />
            <button className="btn" onClick={saveInbox} disabled={inboxBusy} style={{ background: 'var(--terra)', color: '#fff' }}>
              {inboxBusy ? '处理中…' : '保存'}
            </button>
            <button className="anbtn" onClick={scanInboxNow} disabled={inboxBusy || !inboxInfo?.accessible} title={inboxInfo?.accessible ? '立即扫描收件箱并入库' : '请先保存一个可访问的收件箱路径'}>
              立即扫描
            </button>
          </div>
          <div style={{ fontSize: 11.5, marginTop: 6 }}>
            {inboxInfo && (
              <span style={{ color: inboxInfo.accessible ? 'var(--terra)' : 'var(--mut)' }}>
                {inboxInfo.inbox_root_path
                  ? (inboxInfo.accessible ? `● 已启用：${inboxInfo.inbox_root_path}` : `○ 路径不可访问：${inboxInfo.inbox_root_path}`)
                  : '○ 未启用收件箱'}
              </span>
            )}
            {inboxMsg && <span style={{ color: 'var(--ink2)', marginLeft: 8 }}>{inboxMsg}</span>}
          </div>
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

      {/* 全文搜索:本地 FTS5/LIKE 检索已入库资料,命中带页码定位(chunk 溯源) */}
      <section className="sec nocollapse" data-open="1">
        <div className="sechead" style={{ cursor: 'default' }}>
          <span className="chev" style={{ visibility: 'hidden' }}>▸</span>
          <span className="stitle">全文搜索</span>
          {searchEngine && <span className="scount">{searchEngine}</span>}
          <span className="shint">本地索引 · 出处精确到页</span>
        </div>
        <div className="secbody">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
              placeholder="搜索已入库资料（关键词 / 编号 / 中文短语）…"
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13, background: 'var(--panel2)', color: 'var(--ink)' }}
            />
            <button className="btn" onClick={doSearch} disabled={searching} style={{ background: 'var(--terra)', color: '#fff' }}>
              {searching ? '搜索中…' : '🔍 搜索'}
            </button>
            {searchHits !== null && (
              <button className="anbtn" onClick={() => { setSearchHits(null); setSearchQ('') }}>清空</button>
            )}
          </div>
          {searchHits !== null && (
            <div style={{ marginTop: 10 }}>
              {searchHits.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--mut)', padding: 6 }}>没有命中。换个关键词试试。</div>
              ) : (
                <>
                  <div style={{ fontSize: 11.5, color: 'var(--mut)', marginBottom: 6 }}>命中 {searchHits.length} 条</div>
                  {searchHits.map((h) => (
                    <div className="kbrow" key={h.document_id} style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <span className="pth" style={{ flex: 'none' }}>
                        📄 <b>{h.title}</b>
                        {h.locator && <span style={{ color: 'var(--terra)', fontSize: 11, marginLeft: 4 }}>· {h.locator}</span>}
                      </span>
                      <span className="meta" style={{ flexBasis: '100%', color: 'var(--ink2)', marginTop: 2 }}>{h.snippet}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
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

      {/* 项目效果图(恢复旧版模式):生图素材 + 效果图成果画廊;统一图源(上传/文档抽取/AI生图)。常驻展开。 */}
      <section className="sec nocollapse" data-open="1">
        <div className="sechead" style={{ cursor: 'default' }}>
          <span className="chev" style={{ visibility: 'hidden' }}>▸</span>
          <span className="stitle">项目效果图 / 图片资产</span>
          <span className="scount">{assets.length} 张</span>
          <span className="shint">{cur ? `当前项目 · ${cur.name}` : '未选择项目'} · 上传 / 文档抽取 / AI 生图</span>
        </div>
        <div className="secbody">
          {!cur ? (
            <div className="gallery"><div className="gempty">请先选择项目。</div></div>
          ) : (() => {
            const mats = assets.filter((a) => MAT_TYPES.includes(a.asset_type))
            const shown = assetTab === 'all' ? assets : assets.filter((a) => a.asset_type === assetTab)
            return (
              <>
                {/* 上半:生图素材 · AI 代理生图来源 */}
                <div className="matwrap">
                  <div className="matlabel">生图素材 · AI 代理生图来源（把下方图标为 参考图 / 白模 / 材质 即成为素材）</div>
                  <div className="matgrid">
                    {mats.length === 0 ? (
                      <div className="matcard"><span className="madd">＋ 暂无素材</span><span className="mhint">空 · 文生图</span></div>
                    ) : (
                      mats.map((m) => (
                        <div key={m.id} className="matcard filled" style={{ backgroundImage: `url("${api.assetThumbUrl(cur.id, m.id)}")` }}>
                          <span className="mname">{TYPE_CN[m.asset_type]}</span>
                          <span className="mtag">素材</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="modebar">
                    <span>生图模式</span><span className="sep">·</span>
                    {mats.length === 0 ? (
                      <span className="mode t2i">文生图（素材为空，按描述直接生成）</span>
                    ) : (
                      <>
                        <span className="mode i2i">图生图（{Math.min(mats.length, 4)} 张素材作参考）</span>
                        <span className="sep">·</span>
                        <span style={{ color: 'var(--mut)' }}>注入提示词</span>
                        <div className="promptchips">
                          {['控制视角', '保持构图', ...mats.slice(0, 4).map((m, i) => `参考图${i + 1}·${TYPE_CN[m.asset_type]}`)].map((c, i) => (
                            <span className="pchip" key={i}>{c}</span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  {mats.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={img2imgPrompt}
                        onChange={(e) => setImg2imgPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') runImg2Img(mats.slice(0, 4).map((m) => m.id)) }}
                        placeholder="描述要生成的效果图（以上方素材为参考图）…"
                        style={{ flex: 1, minWidth: 240, padding: '8px 12px', border: '1px solid var(--line2)', borderRadius: 8, fontSize: 13, background: 'var(--panel2)', color: 'var(--ink)' }}
                      />
                      <button className="btn" disabled={img2imgBusy || !img2imgPrompt.trim()}
                        onClick={() => runImg2Img(mats.slice(0, 4).map((m) => m.id))}
                        style={{ background: 'var(--terra)', color: '#fff' }}>
                        {img2imgBusy ? '生成中…（约 30-60s）' : `用这 ${Math.min(mats.length, 4)} 张素材生图`}
                      </button>
                    </div>
                  )}
                  {img2imgMsg && <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 4 }}>{img2imgMsg}</div>}
                </div>

                {/* 筛选 tab */}
                <div className="matlabel" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ alignSelf: 'center' }}>效果图成果</span>
                  <span style={{ flex: 1 }} />
                  {ASSET_TABS.map((t) => {
                    const n = t.key === 'all' ? assets.length : assets.filter((a) => a.asset_type === t.key).length
                    return (
                      <button key={t.key} className="anbtn" onClick={() => setAssetTab(t.key)}
                        style={assetTab === t.key ? { borderColor: 'var(--terra-line)', background: 'var(--terra-soft)', color: 'var(--terra)' } : undefined}>
                        {t.label}（{n}）
                      </button>
                    )
                  })}
                </div>

                {/* 下半:效果图成果画廊 */}
                {shown.length === 0 ? (
                  <div className="gallery"><div className="gempty">
                    {assetTab === 'all'
                      ? '当前项目暂无效果图。可上传图片 / 从文档抽取 / 由 AI 生图生成后自动归档到这里。'
                      : `当前项目暂无「${ASSET_TABS.find((t) => t.key === assetTab)?.label}」。可在某张图上「分类…」改成此类。`}
                  </div></div>
                ) : (
                  <div className="gallery">
                    {shown.slice(0, 60).map((a) => (
                      <div key={a.id} className="gtile" style={{ backgroundImage: `url("${api.assetThumbUrl(cur.id, a.id)}")` }}>
                        <span className="glabel">
                          {TYPE_CN[a.asset_type] || '图片'} · {(a.caption || '').slice(0, 12) || (a.slide_no ? `第${a.slide_no}页` : a.page_no ? `第${a.page_no}页` : '未命名')}
                        </span>
                        <div className="gov">
                          <select
                            title="改分类"
                            value=""
                            onChange={(e) => { if (e.target.value) reclassAsset(a.id, e.target.value) }}
                            style={{ height: 28, fontSize: 11, border: 0, borderRadius: 8, background: '#fffffff0', color: 'var(--ink)', cursor: 'pointer' }}
                          >
                            <option value="">分类…</option>
                            {RECLASS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                          </select>
                          <a href={api.assetImageUrl(cur.id, a.id)} target="_blank" rel="noreferrer" title="查看原图"
                            style={{ width: 28, height: 28, borderRadius: 8, background: '#fffffff0', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>🔍</a>
                          <a href={api.assetImageUrl(cur.id, a.id)} download title="下载原图"
                            style={{ width: 28, height: 28, borderRadius: 8, background: '#fffffff0', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>⬇</a>
                          <button className="gx" title="移除(软隐藏,可恢复,不删原文件)" onClick={() => removeAsset(a.id)}>✕</button>
                        </div>
                      </div>
                    ))}
                    {shown.length > 60 && <div className="gempty" style={{ gridColumn: '1 / -1' }}>…共 {shown.length} 张，已显示前 60</div>}
                  </div>
                )}

                {/* 已移除(软隐藏)资产 → 可恢复;原图/源文件都还在 */}
                {removed.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <button className="anbtn" style={{ fontSize: 11 }} onClick={() => setShowRemoved((v) => !v)}>
                      已移除（{removed.length}）{showRemoved ? ' 收起 ▴' : ' 查看 ▾'}
                    </button>
                    {showRemoved && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {removed.slice(0, 40).map((a) => (
                          <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <img src={api.assetThumbUrl(cur.id, a.id)} alt={a.caption.slice(0, 12) || '已移除'} title={a.caption}
                              style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line2)', opacity: 0.55 }} />
                            <button className="anbtn" style={{ fontSize: 10, padding: '1px 7px' }} onClick={() => restoreAsset(a.id)}>恢复</button>
                          </div>
                        ))}
                        {removed.length > 40 && <div style={{ alignSelf: 'center', fontSize: 11, color: 'var(--mut)' }}>…共 {removed.length} 张</div>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </section>

      {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

      <CrossProjectLibrary />
    </>
  )
}

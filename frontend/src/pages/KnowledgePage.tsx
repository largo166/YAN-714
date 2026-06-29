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

// DC 暗色基元（与 BossPage/CampPage/HubPage/ProjectCenterPage 同一套色板，跨页一致）
const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d', green: '#49d18d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674', line: 'rgba(255,255,255,.08)',
  glass: 'linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))',
}

/** 环形仪表（pct 真实，发光 conic 环 + 中心大号 %）。 */
function Gauge({ pct, label, color }: { pct: number; label: string; color: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div style={{ width: 148, height: 148, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: `conic-gradient(${color} 0% ${p}%, rgba(255,255,255,.06) ${p}% 100%)`, boxShadow: `0 0 42px ${color}38` }}>
      <div style={{ width: 112, height: 112, borderRadius: '50%', background: '#0a0c12', display: 'grid', placeItems: 'center', textAlign: 'center', border: `1px solid ${C.line}` }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p}<span style={{ fontSize: 13, color: C.mut }}>%</span></div>
          <div style={{ fontSize: 10.5, color: C.mut, marginTop: 3 }}>{label}</div>
        </div>
      </div>
    </div>
  )
}

/** 分组标题——竖条 + 标题 + 渐隐分隔线。 */
function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px' }}>
      <span style={{ width: 4, height: 16, borderRadius: 2, background: 'linear-gradient(180deg,#7c5cff,#42a5ff)', flexShrink: 0 }} />
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-.02em', flexShrink: 0 }}>{children}</h2>
      {hint && <span style={{ fontSize: 11.5, color: C.mut }}>{hint}</span>}
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${C.line},transparent)` }} />
    </div>
  )
}

/** 数据基地 · v2 驾驶舱版面：库存脉搏(索引完成率环 + reindex) + 全文检索 双 HERO，
 *  ① 读取与整理(状态机发光管线) · ② 知识库(文档/资产两栏) · ③ 图片资产 · ④ 跨项目复用库。
 *  主线=读进来→索引→检索/复用；所有按钮接真实 API、不伪造、三态保留，逻辑全不动。 */
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

  // 全库重建索引（reindex）：库存脉搏卡内幽灵按钮触发，刷新 stats
  const [reindexing, setReindexing] = useState(false)
  const [reindexMsg, setReindexMsg] = useState<string | null>(null)

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
  // 效果图画廊分页:一次最多读 6 张缩略图;切项目/切 tab 重置回 6
  const [galleryShown, setGalleryShown] = useState(6)
  useEffect(() => { setGalleryShown(6) }, [cur?.id, assetTab])
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

  const doReindex = async () => {
    if (reindexing) return
    setReindexing(true)
    setReindexMsg(null)
    try {
      const r = await api.reindexKnowledge()
      setReindexMsg(`已重建索引 ${r.reindexed} 条 · ${(r.engine || '').toUpperCase()}`)
      loadStats()
    } catch (e) {
      setReindexMsg((e as Error).message)
    } finally {
      setReindexing(false)
    }
  }

  // 当前生效的整理目标根:配置了仓库则显示仓库路径,否则"程序内部目录"。
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

  // <input webkitdirectory> 是非标准属性,JSX 不认;打开时用 ref 设上,即可选整个文件夹。
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  // 拖拽接入：把文件拖进数据基地 → 喂进「待整理」(走原有 命名项目→一键整理 确认流，不直接落库)
  const dragDepth = useRef(0)
  const [drag, setDrag] = useState(false)

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
      const list = await api.listProjects()
      let proj = list.items.find((p) => p.name === name) ?? null
      if (!proj) proj = await api.createProject({ name, status: 'active' })
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
      await reloadProjects()
      setIngestResult({ projectName: name, projectId: proj.id, uploaded, indexed, failed, total: picked.files.length })
      setLastIngestAt(new Date())
      setSwitchNote(`已整理「${name}」：接入 ${uploaded} 个文件、索引 ${indexed} 个${failed ? `，失败 ${failed}` : ''}，已在「项目中心」下拉。`)
      await loadDocs()
      loadStats()
      const pid = proj.id
      void Promise.all(uploadedIds.map((fid) => api.extractFileAssets(pid, fid).catch(() => null))).then(loadAssets)
    } catch (e) {
      setIngestFailed(true)
      setErr((e as Error).message)
    } finally {
      setIngesting(false)
      setIngestProg(null)
    }
  }

  const busy = ingesting

  const idxPct = stats && stats.documents > 0 ? (stats.indexed / stats.documents) * 100 : 0
  const miniStat = (n: React.ReactNode, label: string, color?: string) => (
    <div><div style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: color || C.ink }}>{n}</div><div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>{label}</div></div>
  )

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDrag(true) }}
      onDragOver={(e) => { e.preventDefault() }}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDrag(false) }}
      onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setDrag(false); const fl = e.dataTransfer?.files; if (fl && fl.length) { onNativePicked(fl, false); setTimeout(() => document.getElementById('sec-ingest')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40) } }}
      style={{ color: C.ink, fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif", letterSpacing: '-.01em' }}>
      {drag && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,10,16,.7)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ border: `2px dashed ${C.purple}`, borderRadius: 24, padding: '40px 64px', background: 'rgba(124,92,255,.08)', color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', boxShadow: '0 0 60px rgba(124,92,255,.4)' }}>
            ⬇ 松手加入「待整理」
            <div style={{ fontSize: 12, fontWeight: 400, color: C.ink2, marginTop: 8 }}>txt/md/pdf/docx/pptx/xlsx/图片 → 命名项目后「一键整理」入库</div>
          </div>
        </div>
      )}
      <div className="ptitle">
        <h1 style={{ background: 'linear-gradient(95deg,#fff,#c8bcff 55%,#80c9ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>数据基地</h1>
        <span className="statpill live" style={{ marginLeft: 8 }}>本地索引 · 已接入</span>
      </div>

      {/* HERO：库存脉搏(索引完成率环 + reindex) + 全文检索 */}
      <GroupLabel hint="读进来 → 索引 → 查得到">库存脉搏 · 检索</GroupLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)', gap: 16 }}>
        <div className="ckcard" style={{ padding: 20, display: 'grid', gridTemplateColumns: '148px 1fr', gap: 18, alignItems: 'center', ['--ac']: 'linear-gradient(90deg,#36e6d4,#42a5ff)', ['--gl']: 'rgba(54,230,212,.22)' } as React.CSSProperties}>
          <Gauge pct={idxPct} label="索引完成率" color={C.cyan} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              {miniStat(stats ? stats.documents : '—', '受管文件')}
              {miniStat(stats ? stats.indexed : '—', '已索引', C.cyan)}
              {miniStat(stats ? stats.cjk_chunks : '—', '索引块·CJK')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10.5, color: C.gold, border: `1px solid ${C.gold}66`, background: `${C.gold}1f`, borderRadius: 7, padding: '2px 8px' }}>{stats ? stats.engine.toUpperCase() : 'FTS5 / BM25'}</span>
              <button type="button" onClick={doReindex} disabled={reindexing} style={{ fontFamily: 'inherit', cursor: reindexing ? 'default' : 'pointer', fontSize: 12, color: '#c8bcff', border: '1px solid rgba(124,92,255,.4)', background: 'rgba(124,92,255,.1)', borderRadius: 9, padding: '6px 12px' }}>{reindexing ? '重建中…' : '⟳ 重建索引'}</button>
            </div>
            {reindexMsg && <div style={{ fontSize: 11.5, color: C.mut, marginTop: 6 }}>{reindexMsg}</div>}
          </div>
        </div>

        <div className="ckcard" style={{ padding: 18, ['--ac']: '#36e6d4', ['--gl']: 'rgba(54,230,212,.2)' } as React.CSSProperties}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>全文检索 <span style={{ fontSize: 11, color: C.mut, fontWeight: 400 }}>本地 · 出处精确到页{searchEngine ? ` · ${searchEngine}` : ''}</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
              placeholder="搜索已入库资料（关键词 / 编号 / 中文短语）…"
              style={{ flex: 1, padding: '9px 12px', border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,.045)', color: C.ink, fontFamily: 'inherit', outline: 'none' }}
            />
            <button type="button" onClick={doSearch} disabled={searching} style={{ height: 38, padding: '0 15px', border: 0, borderRadius: 10, background: 'linear-gradient(135deg,#36e6d4,#42a5ff)', color: '#06221f', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>{searching ? '搜索中…' : '🔍 搜索'}</button>
            {searchHits !== null && <button type="button" className="anbtn" onClick={() => { setSearchHits(null); setSearchQ('') }}>清空</button>}
          </div>
          {searchHits !== null && (
            <div style={{ marginTop: 10 }}>
              {searchHits.length === 0 ? (
                <div style={{ fontSize: 12, color: C.mut, padding: 6 }}>没有命中。换个关键词试试。</div>
              ) : (
                <>
                  <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 4 }}>命中 {searchHits.length} 条</div>
                  {searchHits.map((h) => (
                    <div key={h.document_id} style={{ fontSize: 12, padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
                      <span><b style={{ color: '#fff' }}>📄 {h.title}</b>{h.locator && <span style={{ color: C.cyan, fontSize: 11, marginLeft: 4 }}>· {h.locator}</span>}</span>
                      <span style={{ display: 'block', color: C.ink2, marginTop: 2 }}>{h.snippet}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ① 读取与整理：状态机发光管线 + 选择/整理 + 收件箱 */}
      <GroupLabel hint="本地来源 → 一键整理入库 · 收件箱自动入库">① 读取与整理</GroupLabel>
      <div id="sec-ingest" className="ckcard" style={{ padding: 18, scrollMarginTop: 14, ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)' } as React.CSSProperties}>
        {/* 状态机发光管线 */}
        {(() => {
          const curStep = ingestResult ? 3 : ingesting ? 2 : picked ? 1 : 0
          const steps = ['选择来源', picked ? `已选 ${picked.files.length} 个` : '已选择待整理', ingesting && ingestProg ? `整理中 ${ingestProg.done}/${ingestProg.total}` : '整理中', '已整理']
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {steps.map((s, i) => {
                const failHere = ingestFailed && i === 2
                const on = i === curStep
                return (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: C.mut2 }}>→</span>}
                    <span style={{ fontSize: 12, borderRadius: 99, padding: '5px 12px', whiteSpace: 'nowrap', border: `1px solid ${on ? (failHere ? 'rgba(255,94,102,.6)' : 'rgba(124,92,255,.6)') : C.line}`, background: i < curStep ? 'rgba(73,209,141,.1)' : on ? (failHere ? 'rgba(255,94,102,.14)' : 'rgba(124,92,255,.16)') : 'rgba(255,255,255,.03)', color: i < curStep ? '#9be6c4' : on ? '#fff' : C.mut, boxShadow: on ? (failHere ? '0 0 16px rgba(255,94,102,.3)' : '0 0 16px rgba(124,92,255,.3)') : 'none' }}>{failHere ? '整理失败' : s}</span>
                  </span>
                )
              })}
            </div>
          )
        })()}

        <input ref={folderInputRef} type="file" style={{ display: 'none' }} onChange={(e) => { onNativePicked(e.target.files, true); e.target.value = '' }} />
        <input ref={filesInputRef} type="file" multiple accept=".txt,.md,.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg" style={{ display: 'none' }} onChange={(e) => { onNativePicked(e.target.files, false); e.target.value = '' }} />
        <div className="btnrow" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={() => folderInputRef.current?.click()} disabled={busy}>📁 选择文件夹</button>
          <button className="btn" onClick={() => filesInputRef.current?.click()} disabled={busy}>📄 选择文件(可多选)</button>
          <button className="btn" onClick={organize} disabled={busy || !picked} style={{ background: 'linear-gradient(135deg,#7c5cff,#42a5ff)', color: '#fff' }}>
            {ingesting ? (ingestProg ? `整理中… ${ingestProg.done}/${ingestProg.total}` : '整理中…') : '⚡ 一键整理'}
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.mut }}>
            整理目标：{repoRoot ? <b style={{ color: C.gold }}>仓库 {repoRoot}</b> : <>程序内部目录（默认）</>}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: C.mut, margin: '6px 2px 0' }}>
          点「选择文件夹 / 文件」弹出系统对话框。只接入可解析文件（txt/md/pdf/docx/pptx/xlsx/图片），自动跳过 .rar 等。确认后点「一键整理」复制接入并建索引，原始文件不动。{!repoRoot && <span> 可在「设置 → 知识库与数据」配置本地仓库文件夹。</span>}
        </div>

        {/* 已选文件预览 + 整理成的项目名(可编辑) */}
        {picked && !ingestResult && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="ct">待整理（{picked.files.length} 个可解析文件，原文件不动）</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '6px 2px' }}>
              <span className="meta">整理成项目：</span>
              <input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="项目名称" style={{ flex: 1, minWidth: 180, padding: '6px 10px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,.045)', color: C.ink }} />
            </div>
            <div style={{ fontSize: 11.5, color: C.mut, margin: '0 2px 6px' }}>
              {picked.fromFolder ? '默认用文件夹名；' : '默认用当前项目名；'}同名项目会并入，否则新建。
              {picked.skipped ? ` 已跳过 ${picked.skipped} 个不支持的文件。` : ''}
            </div>
            {picked.files.slice(0, 10).map((f, i) => (
              <div className="kbrow" key={i}>
                <span className="pth">📄 {(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}</span>
                <span className="meta">{fmtSize(f.size)}</span>
              </div>
            ))}
            {picked.files.length > 10 && <div style={{ fontSize: 11.5, color: C.mut, padding: 4 }}>…等共 {picked.files.length} 个</div>}
          </div>
        )}

        {/* 整理结果卡 */}
        {ingestResult && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="ct">整理结果 · 项目「{ingestResult.projectName}」</div>
            <div style={{ fontSize: 13, color: C.ink2, margin: '4px 2px' }}>
              接入 <b>{ingestResult.uploaded}</b> 个文件 · 建索引 <b>{ingestResult.indexed}</b> · 失败 <b>{ingestResult.failed}</b> / 共 {ingestResult.total}
            </div>
            <div style={{ fontSize: 12, color: C.mut, margin: '0 2px 4px' }}>
              索引状态：{ingestResult.indexed > 0 ? `已建立本地索引（${ingestResult.indexed} 条）` : '本次无新增索引'}
              {lastIngestAt && <> · 最近整理时间：{lastIngestAt.toLocaleString('zh-CN')}</>}
            </div>
            <div className="kbrow" style={{ flexWrap: 'wrap' }}>
              <span className="pth"><b>{ingestResult.projectName}</b></span>
              <span className="act" style={{ color: C.purple }} onClick={() => { setCurId(ingestResult.projectId); setSwitchNote(`已设为当前项目「${ingestResult.projectName}」，切到「项目中心」即可看到它的文件 / 认知。`) }}>设为当前项目</span>
            </div>
            {switchNote && <div style={{ fontSize: 12, color: C.mut, marginTop: 6 }}>{switchNote}</div>}
          </div>
        )}
      </div>

      {/* 收件箱监听 */}
      <div className="ckcard" style={{ padding: 18, marginTop: 12, ['--ac']: '#49d18d', ['--gl']: 'rgba(73,209,141,.18)' } as React.CSSProperties}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          收件箱监听 <span style={{ fontSize: 11, color: C.mut, fontWeight: 400 }}>丢进文件夹的文件自动入库</span>
          {inboxInfo?.accessible && <span style={{ fontSize: 10.5, color: C.amber, border: `1px solid ${C.amber}66`, background: `${C.amber}1f`, borderRadius: 99, padding: '2px 8px' }}>待处理 {inboxInfo.pending}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 8 }}>
          后台每分钟自动扫描并接入知识库（入库后原件移到该文件夹下的 <code>_done/</code>）。也可随时点「立即扫描」。
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={inboxInput} onChange={(e) => setInboxInput(e.target.value)} placeholder="收件箱文件夹的完整路径，如 C:\Users\…\ROM-AI收件箱" style={{ flex: 1, minWidth: 240, padding: '8px 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,.045)', color: C.ink }} />
          <button className="btn" onClick={saveInbox} disabled={inboxBusy} style={{ background: 'linear-gradient(135deg,#7c5cff,#42a5ff)', color: '#fff' }}>{inboxBusy ? '处理中…' : '保存'}</button>
          <button className="anbtn" onClick={scanInboxNow} disabled={inboxBusy || !inboxInfo?.accessible} title={inboxInfo?.accessible ? '立即扫描收件箱并入库' : '请先保存一个可访问的收件箱路径'}>立即扫描</button>
        </div>
        <div style={{ fontSize: 11.5, marginTop: 6 }}>
          {inboxInfo && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: inboxInfo.accessible ? C.green : C.mut }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: inboxInfo.accessible ? C.green : C.mut2, boxShadow: inboxInfo.accessible ? `0 0 8px ${C.green}` : 'none' }} />
              {inboxInfo.inbox_root_path ? (inboxInfo.accessible ? `已启用：${inboxInfo.inbox_root_path}` : `路径不可访问：${inboxInfo.inbox_root_path}`) : '未启用收件箱'}
            </span>
          )}
          {inboxMsg && <span style={{ color: C.ink2, marginLeft: 8 }}>{inboxMsg}</span>}
        </div>
      </div>

      {/* ② 知识库：已入库文档(主) + 可复用资产 / 库存健康(侧) 两栏 */}
      <GroupLabel hint="已入库文档 · 可复用资产">② 知识库</GroupLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 18, alignItems: 'start' }}>
        <div className="ckcard" style={{ padding: '16px 18px', ['--ac']: '#42a5ff', ['--gl']: 'rgba(66,165,255,.18)' } as React.CSSProperties}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 8 }}>已入库文档 <span style={{ fontSize: 11, color: C.mut, fontWeight: 400 }}>{docs.length} · 点条目展开 · SQLite 落库</span></div>
          {loading && <div style={{ color: C.mut, fontSize: 12, padding: 8 }}>加载中…</div>}
          {!loading && docs.length === 0 && (
            <div style={{ color: C.mut, fontSize: 12, padding: 8 }}>暂无已入库文档。先「选择来源」再「一键整理」接入本地文件后会出现在这里。</div>
          )}
          {docs.map((d) => {
            const expanded = expandedId === d.id
            const det = detailCache[d.id]
            const parseStatus = det ? (det.content_text.trim() ? '已解析入库' : '仅元数据登记') : '加载中…'
            return (
              <div className="rgroup" key={d.id}>
                <div className="kbrow" style={{ flexWrap: 'wrap' }}>
                  <span className="pth" style={{ cursor: 'pointer' }} onClick={() => toggleExpand(d.id)}>
                    <span style={{ color: C.mut, marginRight: 4 }}>{expanded ? '▾' : '▸'}</span>
                    {d.type && <span className="chip" style={{ marginRight: 6, fontSize: 10 }}>{d.type}</span>}
                    <b>{d.title}</b>
                    {d.tags && <span style={{ color: C.mut, marginLeft: 8 }}>#{d.tags}</span>}
                  </span>
                  <span className="meta">{d.file_type}</span>
                  <span className="act" onClick={() => genMeta(d.id)} style={{ color: C.purple, opacity: genningId === d.id ? 0.5 : 1 }}>{genningId === d.id ? '生成中…' : 'AI 生成元数据'}</span>
                  <span className="act" onClick={() => del(d.id)} style={{ color: C.red }}>删除</span>
                </div>
                {expanded && (
                  <div style={{ width: '100%', marginTop: 6, padding: '8px 10px', background: 'rgba(255,255,255,.03)', borderRadius: 8, fontSize: 12.5 }}>
                    <div className="kvline"><span className="kvk">文件名</span>{d.title}</div>
                    <div className="kvline"><span className="kvk">文件类型</span>{d.file_type}{d.type ? ` · ${d.type}` : ''}</div>
                    <div className="kvline"><span className="kvk">来源路径</span><span className="mono" style={{ wordBreak: 'break-all' }}>{d.source_path || '—'}</span></div>
                    <div className="kvline"><span className="kvk">来源说明</span>{d.resource || '—'}</div>
                    <div className="kvline"><span className="kvk">摘要</span>{d.description ? renderInline(d.description) : '（未生成，可点「AI 生成元数据」）'}</div>
                    <div className="kvline"><span className="kvk">入库方式</span>复制接入（原文件不动，系统留受管副本）</div>
                    <div className="kvline"><span className="kvk">解析状态</span>{parseStatus}</div>
                    <div className="kvline" style={{ alignItems: 'flex-start' }}>
                      <span className="kvk">内容片段</span>
                      <span style={{ whiteSpace: 'pre-wrap', color: C.ink2 }}>
                        {det ? (det.content_text.trim() ? det.content_text.slice(0, 500) + (det.content_text.length > 500 ? ' …' : '') : '（无正文，仅登记元数据）') : '加载中…'}
                      </span>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <button className="anbtn" disabled={genningId === d.id} onClick={() => genMeta(d.id)}>{genningId === d.id ? '生成中…' : 'AI 生成元数据'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {metaNote && <div style={{ fontSize: 12, color: C.mut, padding: '6px 2px' }}>{metaNote}</div>}
        </div>

        <aside style={{ display: 'grid', gap: 14 }}>
          <div className="ckcard" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>可复用资产 · 沉淀层 <span style={{ fontSize: 11, color: C.mut, fontWeight: 400 }}>{assetGroups.length ? `${assetGroups.length} 类` : '空'}</span></div>
            {assetGroups.length === 0 ? (
              <div style={{ color: C.mut, fontSize: 12.5, padding: '4px 0' }}>暂无可复用资产。给文档打标签后，会在此按标签自动聚合。</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {assetGroups.map(([group, items]) => (
                  <div key={group}>
                    <div style={{ fontSize: 12, color: C.ink2, marginBottom: 5 }}>{group} <span style={{ color: C.mut }}>· {items.length}</span></div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items.map((x, i) => <span key={group + i} style={{ fontSize: 11, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 7, padding: '2px 8px' }}>{x}</span>)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ckcard" style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>库存健康</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.ink2, padding: '5px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}`, flexShrink: 0 }} />索引状态 正常 · {stats ? stats.engine.toUpperCase() : 'FTS5 / BM25'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12, color: C.ink2, padding: '5px 0' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.mut2, flexShrink: 0, transform: 'translateY(2px)' }} />图纸 / 图片登记元数据，暂不入全文检索
            </div>
          </div>
        </aside>
      </div>

      {/* ③ 图片资产：生图素材 + img2img + 效果图画廊 */}
      <GroupLabel hint={cur ? `当前项目 · ${cur.name} · 上传 / 文档抽取 / AI 生图` : '未选择项目'}>③ 图片资产</GroupLabel>
      <div className="ckcard" style={{ padding: 18, ['--ac']: 'linear-gradient(90deg,#7c5cff,#36e6d4)' } as React.CSSProperties}>
        {!cur ? (
          <div className="gallery"><div className="gempty">请先选择项目。</div></div>
        ) : (() => {
          const mats = assets.filter((a) => MAT_TYPES.includes(a.asset_type))
          const shown = assetTab === 'all' ? assets : assets.filter((a) => a.asset_type === assetTab)
          return (
            <>
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
                    <input value={img2imgPrompt} onChange={(e) => setImg2imgPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runImg2Img(mats.slice(0, 4).map((m) => m.id)) }} placeholder="描述要生成的效果图（以上方素材为参考图）…" style={{ flex: 1, minWidth: 240, padding: '8px 12px', border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,.045)', color: C.ink }} />
                    <button className="btn" disabled={img2imgBusy || !img2imgPrompt.trim()} onClick={() => runImg2Img(mats.slice(0, 4).map((m) => m.id))} style={{ background: 'linear-gradient(135deg,#7c5cff,#42a5ff)', color: '#fff' }}>{img2imgBusy ? '生成中…（约 30-60s）' : `用这 ${Math.min(mats.length, 4)} 张素材生图`}</button>
                  </div>
                )}
                {img2imgMsg && <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 4 }}>{img2imgMsg}</div>}
              </div>

              <div className="matlabel" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                <span style={{ alignSelf: 'center' }}>效果图成果</span>
                <span style={{ flex: 1 }} />
                {ASSET_TABS.map((t) => {
                  const n = t.key === 'all' ? assets.length : assets.filter((a) => a.asset_type === t.key).length
                  return (
                    <button key={t.key} className="anbtn" onClick={() => setAssetTab(t.key)} style={assetTab === t.key ? { borderColor: 'var(--terra-line)', background: 'var(--terra-soft)', color: 'var(--terra)' } : undefined}>{t.label}（{n}）</button>
                  )
                })}
              </div>

              {shown.length === 0 ? (
                <div className="gallery"><div className="gempty">
                  {assetTab === 'all' ? '当前项目暂无效果图。可上传图片 / 从文档抽取 / 由 AI 生图生成后自动归档到这里。' : `当前项目暂无「${ASSET_TABS.find((t) => t.key === assetTab)?.label}」。可在某张图上「分类…」改成此类。`}
                </div></div>
              ) : (
                <div className="gallery">
                  {shown.slice(0, galleryShown).map((a) => (
                    <div key={a.id} className="gtile" style={{ backgroundImage: `url("${api.assetThumbUrl(cur.id, a.id)}")` }}>
                      <span className="glabel">{TYPE_CN[a.asset_type] || '图片'} · {(a.caption || '').slice(0, 12) || (a.slide_no ? `第${a.slide_no}页` : a.page_no ? `第${a.page_no}页` : '未命名')}</span>
                      <div className="gov">
                        <select title="改分类" value="" onChange={(e) => { if (e.target.value) reclassAsset(a.id, e.target.value) }} style={{ height: 28, fontSize: 11, border: 0, borderRadius: 8, background: 'rgba(20,22,30,.92)', color: C.ink, cursor: 'pointer' }}>
                          <option value="">分类…</option>
                          {RECLASS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                        <a href={api.assetImageUrl(cur.id, a.id)} target="_blank" rel="noreferrer" title="查看原图" style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(20,22,30,.92)', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>🔍</a>
                        <a href={api.assetImageUrl(cur.id, a.id)} download title="下载原图" style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(20,22,30,.92)', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>⬇</a>
                        <button className="gx" title="移除(软隐藏,可恢复,不删原文件)" onClick={() => removeAsset(a.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                  {shown.length > galleryShown && (
                    <div className="gempty" style={{ gridColumn: '1 / -1' }}>
                      <button className="anbtn" onClick={() => setGalleryShown((n) => n + 6)}>加载更多（每次 6 张，已显示 {Math.min(galleryShown, shown.length)} / {shown.length}）</button>
                    </div>
                  )}
                </div>
              )}

              {removed.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <button className="anbtn" style={{ fontSize: 11 }} onClick={() => setShowRemoved((v) => !v)}>已移除（{removed.length}）{showRemoved ? ' 收起 ▴' : ' 查看 ▾'}</button>
                  {showRemoved && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {removed.slice(0, 40).map((a) => (
                        <div key={a.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                          <img src={api.assetThumbUrl(cur.id, a.id)} alt={a.caption.slice(0, 12) || '已移除'} title={a.caption} style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.line}`, opacity: 0.55 }} />
                          <button className="anbtn" style={{ fontSize: 10, padding: '1px 7px' }} onClick={() => restoreAsset(a.id)}>恢复</button>
                        </div>
                      ))}
                      {removed.length > 40 && <div style={{ alignSelf: 'center', fontSize: 11, color: C.mut }}>…共 {removed.length} 张</div>}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* ④ 跨项目复用库（已暗，全局翻暗即生效） */}
      <GroupLabel hint="B1–B6 · 已沉淀(只读)">④ 跨项目复用库</GroupLabel>
      <CrossProjectLibrary />

      {err && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>错误：{err}</div>}
    </div>
  )
}

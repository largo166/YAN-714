import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FileText, Files, FolderOpen, Search, Zap, ZoomIn } from 'lucide-react'

import { api, type FileAsset } from '@/lib/api'
import BoardBackdrop from '@/lib/BoardBackdrop'
import { CountNum, useCountUp } from '@/lib/useCountUp'
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

// DC 暗色基元——P2 收口后只剩动态场景(仪表/状态点/悬停还原)仍引用的键;静态样式全走 Tailwind token
const C = {
  purple: '#7c5cff', cyan: '#36e6d4', green: '#49d18d',
  line: 'rgba(255,255,255,.08)', mut: '#8f96a5', mut2: '#5f6674',
}
// 玻璃输入框(跨节复用)
const fieldCls = 'border border-solid border-line rounded-[8px] text-[13px] bg-[rgba(255,255,255,.045)] text-ink [font-family:inherit] outline-none'
// 钦定主渐变按钮底(DESIGN.md §3)
const gradBtn = 'bg-[linear-gradient(135deg,#7c5cff,#42a5ff)] text-white'

/** 环形仪表（pct 真实，发光 conic 环 + 充能动画 + 中心数字滚动）。 */
function Gauge({ pct, label, color }: { pct: number; label: string; color: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const shown = useCountUp(p, 900)
  return (
    <div className="gauge-anim w-[148px] h-[148px] rounded-full grid place-items-center shrink-0" style={{ ['--gp']: `${p}%`, background: `conic-gradient(${color} 0% var(--gp), rgba(255,255,255,.06) var(--gp) 100%)`, boxShadow: `0 0 42px ${color}38` } as React.CSSProperties}>
      <div className="w-28 h-28 rounded-full grid place-items-center text-center border border-solid border-line" style={{ background: '#0a0c12' }}>
        <div>
          <div className="text-[32px] font-bold tracking-[-.03em] leading-none tabular-nums">{shown}<span className="text-[13px] text-mut">%</span></div>
          <div className="text-[10.5px] text-mut mt-[3px]">{label}</div>
        </div>
      </div>
    </div>
  )
}

/** 分组标题——竖条 + 标题 + 渐隐分隔线。 */
function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center gap-[10px] mt-[22px] mx-0 mb-3">
      <span className="w-1 h-4 rounded-[2px] bg-[linear-gradient(180deg,#7c5cff,#42a5ff)] shrink-0" />
      <h2 className="m-0 text-[16px] font-bold text-white tracking-[-.02em] shrink-0">{children}</h2>
      {hint && <span className="text-[11.5px] text-mut">{hint}</span>}
      <span className="flex-1 h-px bg-[linear-gradient(90deg,rgba(255,255,255,.08),transparent)]" />
    </div>
  )
}

/** 数据基地 · v3 版面：库存脉搏(索引完成率环 + reindex) + 全文检索 双 HERO，
 *  ① 读取与整理(状态机发光管线) · ② 知识库(类型统计 tile + 最近入库 5 条,全量列表在右滑抽屉) ·
 *  ③ 图片资产(画廊主角 + AI 生图工坊折叠) · ④ 跨项目复用库。首屏零文件名长列表。
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

  // 文档抽屉(改版 2026-07):首屏只留 类型统计 tile + 最近 5 条,全量列表收进右滑抽屉(复用 .setdrawer 骨架)
  const [docsDrawerOpen, setDocsDrawerOpen] = useState(false)
  const [drawerFilter, setDrawerFilter] = useState<{ kind: 'type' | 'tag'; value: string } | null>(null)
  const [workshopOpen, setWorkshopOpen] = useState(false) // ③ AI 生图工坊折叠,默认收(花钱动作多一次点击=保护)

  // 全库重建索引（reindex）：库存脉搏卡内幽灵按钮触发，刷新 stats
  const [reindexing, setReindexing] = useState(false)
  const [reindexMsg, setReindexMsg] = useState<string | null>(null)

  // 批量 AI 元数据（P1）：只跑缺摘要的文档,逐条顺序调用(复用单条端点,不开新管线);
  // 属花钱动作——只由用户点按钮触发,可随时停;未配 Key 立即停并引导。
  const [batchBusy, setBatchBusy] = useState(false)
  const batchStop = useRef(false)
  const [batchNote, setBatchNote] = useState<string | null>(null)
  const metaMissing = useMemo(() => docs.filter((d) => !(d.description || '').trim()), [docs])
  const runBatchMeta = async () => {
    if (batchBusy || metaMissing.length === 0) return
    setBatchBusy(true)
    batchStop.current = false
    let ok = 0
    let skip = 0
    let fail = 0
    const list = [...metaMissing]
    for (let i = 0; i < list.length; i++) {
      if (batchStop.current) break
      setBatchNote(`批量生成中… ${i + 1}/${list.length}（成功 ${ok}${skip ? ` · 跳过 ${skip}` : ''}）`)
      try {
        const r = await api.generateDocMetadata(list[i].id)
        if (r.status === 'ok') ok++
        else if (r.status === 'not_configured') {
          setBatchNote('尚未配置 AI 引擎。到「设置」填入 DeepSeek API Key 后再批量生成。')
          setBatchBusy(false)
          return
        } else skip++ // no_material / error:如实跳过,继续下一条
      } catch {
        fail++
      }
    }
    setBatchNote(`批量完成：成功 ${ok} · 跳过 ${skip}${fail ? ` · 失败 ${fail}` : ''}${batchStop.current ? '（已手动停止）' : ''}`)
    setBatchBusy(false)
    loadDocs()
  }

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

  // 类型分组统计(真实 type 聚合,'未分类'兜底,不伪造类型)
  const typeGroups = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of docs) { const k = (d.type || '').trim() || '未分类'; m.set(k, (m.get(k) || 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [docs])
  // 最近入库 ≤5:id 降序=真实入库序(不赌 created_at 字符串格式)
  const recentDocs = useMemo(() => [...docs].sort((a, b) => b.id - a.id).slice(0, 5), [docs])
  // 抽屉内文档:按 type / tag 预过滤(tag split 正则与 assetGroups 同款,口径一致)
  const drawerDocs = useMemo(() => {
    if (!drawerFilter) return docs
    if (drawerFilter.kind === 'type') return docs.filter((d) => ((d.type || '').trim() || '未分类') === drawerFilter.value)
    return docs.filter((d) => (d.tags || '').split(/[,，;；\s]+/).map((x) => x.trim()).includes(drawerFilter.value))
  }, [docs, drawerFilter])
  const openDrawer = (f: { kind: 'type' | 'tag'; value: string } | null) => { setDrawerFilter(f); setDocsDrawerOpen(true) }
  const anbtnOn = { borderColor: 'var(--terra-line)', background: 'var(--terra-soft)', color: 'var(--terra)' } as const // 与 assetTab 选中态同款

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

  // 收件箱监听(P1-C):设一个文件夹,新文件自动入库(后台 60s 轮询 + 此处手动兜底)。默认折叠。
  const [inboxOpen, setInboxOpen] = useState(false)
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
    <div><div className="text-[19px] font-bold tabular-nums text-ink" style={color ? { color } : undefined}>{n}</div><div className="text-[11px] text-mut mt-[2px]">{label}</div></div>
  )

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDrag(true) }}
      onDragOver={(e) => { e.preventDefault() }}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDrag(false) }}
      onDrop={(e) => { e.preventDefault(); dragDepth.current = 0; setDrag(false); const fl = e.dataTransfer?.files; if (fl && fl.length) { onNativePicked(fl, false); setTimeout(() => document.getElementById('sec-ingest')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40) } }}
      className="text-ink">
      {drag && (
        <div className="fixed inset-0 z-[80] bg-[rgba(8,10,16,.7)] grid place-items-center pointer-events-none">
          <div className="border-2 border-dashed border-brand-purple rounded-[24px] py-10 px-16 bg-brand-purple/[.08] text-white text-[18px] font-bold text-center shadow-[0_0_60px_rgba(124,92,255,.4)]">
            ⬇ 松手加入「待整理」
            <div className="text-[12px] font-normal text-ink-2 mt-2">txt/md/pdf/docx/pptx/xlsx/图片 → 命名项目后「一键整理」入库</div>
          </div>
        </div>
      )}
      {/* HERO 区:板块动态背景(数据流)只罩 头部+库存脉搏/检索 双卡(按小样,不铺全页) */}
      <section className="relative">
        <BoardBackdrop mode="aurora" />
        <div className="relative z-[1]">
      <div className="ptitle">
        <h1 className="bg-[linear-gradient(95deg,#fff,#c8bcff_55%,#80c9ff)] bg-clip-text text-transparent">数据基地</h1>
        <span className="statpill live ml-2">本地索引 · 已接入</span>
      </div>
      <p className="mt-[-6px] mx-0 mb-[14px] text-mut text-[13px]">让公司的每一份材料，都变成 AI 能引用的记忆。</p>

      {/* HERO：库存脉搏(索引完成率环 + reindex) + 全文检索 */}
      <GroupLabel hint="读进来 → 索引 → 查得到">库存脉搏 · 检索</GroupLabel>
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
        <div className="gshell">
          <div className="gshell-in p-5 grid grid-cols-[148px_1fr] gap-[18px] items-center">
          <Gauge pct={idxPct} label="索引完成率" color={C.purple} />
          <div className="min-w-0">
            <div className="flex gap-4 flex-wrap mb-3">
              {miniStat(stats ? <CountNum n={stats.documents} /> : '—', '受管文件')}
              {miniStat(stats ? <CountNum n={stats.indexed} /> : '—', '已索引', C.cyan)}
              {miniStat(stats ? <CountNum n={stats.cjk_chunks} /> : '—', '索引块·CJK')}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10.5px] text-brand-gold border border-solid border-brand-gold/40 bg-brand-gold/[.12] rounded-[7px] py-[2px] px-2">{stats ? stats.engine.toUpperCase() : 'FTS5 / BM25'}</span>
              <button type="button" onClick={doReindex} disabled={reindexing} className="[font-family:inherit] cursor-pointer disabled:cursor-default text-[12px] border border-solid border-brand-purple/40 bg-brand-purple/10 rounded-[9px] py-[6px] px-3" style={{ color: '#c8bcff' }}>{reindexing ? '重建中…' : '⟳ 重建索引'}</button>
            </div>
            {reindexMsg && <div className="text-[11.5px] text-mut mt-[6px]">{reindexMsg}</div>}
          </div>
          </div>
        </div>

        <div className="ckcard p-[18px]" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.2)' } as React.CSSProperties}>
          <div className="text-[14px] font-bold text-white mb-[10px]">全文检索 <span className="text-[11px] text-mut font-normal">本地 · 出处精确到页{searchEngine ? ` · ${searchEngine}` : ''}</span></div>
          <div className="flex gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
              placeholder="搜索已入库资料（关键词 / 编号 / 中文短语）…"
              className={`flex-1 py-[9px] px-3 rounded-[10px] ${fieldCls}`}
            />
            <button type="button" onClick={doSearch} disabled={searching} className={`h-9 py-0 px-[15px] border-0 rounded-[10px] ${gradBtn} font-bold text-[13px] tracking-[.02em] [font-family:inherit] cursor-pointer inline-flex items-center gap-[6px]`}>{searching ? '搜索中…' : <><Search size={14} /> 搜索</>}</button>
            {searchHits !== null && <button type="button" className="anbtn" onClick={() => { setSearchHits(null); setSearchQ('') }}>清空</button>}
          </div>
          {searchHits !== null && (
            <div className="mt-[10px]">
              {searchHits.length === 0 ? (
                <div className="text-[12px] text-mut p-[6px]">没有命中。换个关键词试试。</div>
              ) : (
                <>
                  <div className="text-[11.5px] text-mut mb-1">命中 {searchHits.length} 条</div>
                  {searchHits.map((h) => (
                    <div key={h.document_id} className="text-[12px] py-2 border-t border-solid border-line">
                      <span><b className="text-white"><FileText size={12} className="align-[-2px] mr-1" />{h.title}</b>{h.locator && <span className="text-brand-cyan text-[11px] ml-1">· {h.locator}</span>}</span>
                      <span className="block text-ink-2 mt-[2px]">{h.snippet}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
        </div>
      </section>

      {/* ① 读取与整理：状态机发光管线 + 选择/整理 + 收件箱 */}
      <GroupLabel hint="本地来源 → 一键整理入库 · 收件箱自动入库">① 读取与整理</GroupLabel>
      <div id="sec-ingest" className="ckcard p-[18px] scroll-mt-[14px]" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)' } as React.CSSProperties}>
        {/* 状态机发光管线 */}
        {(() => {
          const curStep = ingestResult ? 3 : ingesting ? 2 : picked ? 1 : 0
          const steps = ['选择来源', picked ? `已选 ${picked.files.length} 个` : '已选择待整理', ingesting && ingestProg ? `整理中 ${ingestProg.done}/${ingestProg.total}` : '整理中', '已整理']
          return (
            <div className="flex items-center gap-[6px] flex-wrap mb-3">
              {steps.map((s, i) => {
                const failHere = ingestFailed && i === 2
                const on = i === curStep
                return (
                  <span key={i} className="flex items-center gap-[6px]">
                    {i > 0 && <span className="text-mut-2">→</span>}
                    <span className="text-[12px] rounded-[99px] py-[5px] px-3 whitespace-nowrap border border-solid" style={{ borderColor: on ? (failHere ? 'rgba(255,94,102,.6)' : 'rgba(124,92,255,.6)') : C.line, background: i < curStep ? 'rgba(73,209,141,.1)' : on ? (failHere ? 'rgba(255,94,102,.14)' : 'rgba(124,92,255,.16)') : 'rgba(255,255,255,.03)', color: i < curStep ? '#9be6c4' : on ? '#fff' : C.mut, boxShadow: on ? (failHere ? '0 0 16px rgba(255,94,102,.3)' : '0 0 16px rgba(124,92,255,.3)') : 'none' }}>{failHere ? '整理失败' : s}</span>
                  </span>
                )
              })}
            </div>
          )
        })()}

        <input ref={folderInputRef} type="file" className="hidden" onChange={(e) => { onNativePicked(e.target.files, true); e.target.value = '' }} />
        <input ref={filesInputRef} type="file" multiple accept=".txt,.md,.pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { onNativePicked(e.target.files, false); e.target.value = '' }} />
        <div className="btnrow flex-wrap items-center">
          <button className="btn inline-flex items-center gap-[6px]" onClick={() => folderInputRef.current?.click()} disabled={busy} title="弹出系统对话框;不支持的格式(如 .rar/.dwg)会自动跳过"><FolderOpen size={15} /> 选择文件夹</button>
          <button className="btn inline-flex items-center gap-[6px]" onClick={() => filesInputRef.current?.click()} disabled={busy} title="可多选；不支持的格式(如 .rar/.dwg)会自动跳过"><Files size={15} /> 选择文件</button>
          <button className={`btn inline-flex items-center gap-[6px] ${gradBtn}`} onClick={organize} disabled={busy || !picked}>
            {ingesting ? (ingestProg ? `整理中… ${ingestProg.done}/${ingestProg.total}` : '整理中…') : <><Zap size={15} /> 一键整理</>}
          </button>
          <span className="ml-auto text-[11.5px] text-mut">
            整理目标：{repoRoot ? <b className="text-brand-gold">仓库 {repoRoot}</b> : <>程序内部目录（默认）</>}
          </span>
        </div>
        <div className="text-[11.5px] text-mut mt-[6px] mx-[2px] mb-0">
          支持 txt·md·pdf·docx·pptx·xlsx·图片;复制接入并建索引,原始文件不动。{!repoRoot && <span className="text-mut-2"> 整理目标可在「设置 → 知识库与数据」配置。</span>}
        </div>

        {/* 已选文件预览 + 整理成的项目名(可编辑) */}
        {picked && !ingestResult && (
          <div className="card mt-3">
            <div className="ct">待整理（{picked.files.length} 个可解析文件，原文件不动）</div>
            <div className="flex gap-2 items-center flex-wrap my-[6px] mx-[2px]">
              <span className="meta">整理成项目：</span>
              <input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="项目名称" className={`flex-1 min-w-[180px] py-[6px] px-[10px] rounded-[8px] ${fieldCls}`} />
            </div>
            <div className="text-[11.5px] text-mut mt-0 mx-[2px] mb-[6px]">
              {picked.fromFolder ? '默认用文件夹名；' : '默认用当前项目名；'}同名项目会并入，否则新建。
              {picked.skipped ? ` 已跳过 ${picked.skipped} 个不支持的文件。` : ''}
            </div>
            {picked.files.slice(0, 5).map((f, i) => (
              <div className="kbrow" key={i}>
                <span className="pth"><FileText size={12} className="align-[-2px] mr-1" />{(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}</span>
                <span className="meta">{fmtSize(f.size)}</span>
              </div>
            ))}
            {picked.files.length > 5 && <div className="text-[11.5px] text-mut p-1">…等共 {picked.files.length} 个</div>}
          </div>
        )}

        {/* 整理结果卡 */}
        {ingestResult && (
          <div className="card mt-3">
            <div className="ct">整理结果 · 项目「{ingestResult.projectName}」</div>
            <div className="text-[13px] text-ink-2 my-1 mx-[2px]">
              接入 <b>{ingestResult.uploaded}</b> 个文件 · 建索引 <b>{ingestResult.indexed}</b> · 失败 <b>{ingestResult.failed}</b> / 共 {ingestResult.total}
            </div>
            <div className="text-[12px] text-mut mt-0 mx-[2px] mb-1">
              索引状态：{ingestResult.indexed > 0 ? `已建立本地索引（${ingestResult.indexed} 条）` : '本次无新增索引'}
              {lastIngestAt && <> · 最近整理时间：{lastIngestAt.toLocaleString('zh-CN')}</>}
            </div>
            <div className="kbrow flex-wrap">
              <span className="pth"><b>{ingestResult.projectName}</b></span>
              <span className="act text-brand-purple" onClick={() => { setCurId(ingestResult.projectId); setSwitchNote(`已设为当前项目「${ingestResult.projectName}」，切到「项目中心」即可看到它的文件 / 认知。`) }}>设为当前项目</span>
            </div>
            {switchNote && <div className="text-[12px] text-mut mt-[6px]">{switchNote}</div>}
          </div>
        )}
      </div>

      {/* 收件箱监听:默认折叠(首屏减负,2026-07)——配置一次即长期后台运行,状态点+待处理数常显,细节点开 */}
      <div className="ckcard mt-3" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.18)' } as React.CSSProperties}>
        <button type="button" onClick={() => setInboxOpen((v) => !v)}
          className="w-full text-left [font-family:inherit] cursor-pointer bg-transparent border-0 py-[14px] px-[18px] flex items-center gap-2 text-ink">
          <span className="text-mut">{inboxOpen ? '▾' : '▸'}</span>
          <span className="text-[14px] font-bold text-white">收件箱监听</span>
          <span className="text-[11px] text-mut">丢进文件夹的文件自动入库</span>
          {inboxInfo && (
            <span className="inline-flex items-center gap-[6px] text-[11px]" style={{ color: inboxInfo.accessible ? C.green : C.mut }}>
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: inboxInfo.accessible ? C.green : C.mut2, boxShadow: inboxInfo.accessible ? `0 0 8px ${C.green}` : 'none' }} />
              {inboxInfo.inbox_root_path ? (inboxInfo.accessible ? '运行中' : '路径不可访问') : '未启用'}
            </span>
          )}
          {inboxInfo?.accessible && inboxInfo.pending > 0 && <span className="text-[10.5px] text-brand-amber border border-solid border-brand-amber/40 bg-brand-amber/[.12] rounded-[99px] py-[2px] px-2">待处理 {inboxInfo.pending}</span>}
        </button>
        {inboxOpen && (
          <div className="pt-0 px-[18px] pb-4">
            <div className="text-[11.5px] text-mut mb-2">
              后台每分钟自动扫描并接入知识库（入库后原件移到该文件夹下的 <code>_done/</code>）。也可随时点「立即扫描」。
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input value={inboxInput} onChange={(e) => setInboxInput(e.target.value)} placeholder="收件箱文件夹的完整路径，如 C:\Users\…\ROM-AI收件箱" className={`flex-1 min-w-[240px] py-2 px-3 rounded-[8px] ${fieldCls}`} />
              <button className={`btn ${gradBtn}`} onClick={saveInbox} disabled={inboxBusy}>{inboxBusy ? '处理中…' : '保存'}</button>
              <button className="anbtn" onClick={scanInboxNow} disabled={inboxBusy || !inboxInfo?.accessible} title={inboxInfo?.accessible ? '立即扫描收件箱并入库' : '请先保存一个可访问的收件箱路径'}>立即扫描</button>
              {!inboxInfo?.accessible && <span className="text-[11px] text-mut-2">（先在左侧填好路径并保存，扫描才可用）</span>}
            </div>
            <div className="text-[11.5px] mt-[6px]">
              {inboxInfo?.inbox_root_path && <span className="text-mut">{inboxInfo.inbox_root_path}</span>}
              {inboxMsg && <span className="text-ink-2 ml-2">{inboxMsg}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ② 知识库：已入库文档(类型统计+最近入库,全量在抽屉) + 可复用资产计数(侧) 两栏 */}
      <GroupLabel hint="类型总览 · 最近入库 · 标签沉淀">② 知识库</GroupLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-[18px] items-start">
        <div className="ckcard py-4 px-[18px]" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.18)' } as React.CSSProperties}>
          <div className="flex items-center gap-[10px] mb-[10px] flex-wrap">
            <div className="text-[14px] font-bold text-white">已入库文档 <span className="text-[11px] text-mut font-normal">{docs.length} 篇 · 按类型归档</span></div>
            <span className="flex-1" />
            {metaMissing.length > 0 && !batchBusy && (
              <button type="button" onClick={runBatchMeta} title={`批量生成元数据（${metaMissing.length} 条缺摘要）`} className="[font-family:inherit] cursor-pointer text-[12px] border border-solid border-brand-purple/40 bg-brand-purple/10 rounded-[9px] py-[5px] px-3" style={{ color: '#c8bcff' }}>
                <Zap size={13} className="align-[-2px] mr-1" />批量生成（{metaMissing.length}）
              </button>
            )}
            {batchBusy && (
              <button type="button" onClick={() => { batchStop.current = true }} className="[font-family:inherit] cursor-pointer text-[12px] border border-solid border-brand-red/40 bg-brand-red/10 rounded-[9px] py-[5px] px-3" style={{ color: '#ff9b9b' }}>
                ■ 停止
              </button>
            )}
            <button className="anbtn" onClick={() => openDrawer(null)}>浏览全部 ▸</button>
          </div>
          {batchNote && <div className="text-[11.5px] text-mut mt-0 mb-2">{batchNote}</div>}
          {loading && <div className="text-mut text-[12px] p-2">加载中…</div>}
          {!loading && docs.length === 0 && (
            <div className="text-mut text-[12px] p-2">暂无已入库文档。先「选择来源」再「一键整理」接入本地文件后会出现在这里。</div>
          )}
          {docs.length > 0 && (
            <>
              {/* 类型分组统计 tile(签名视觉:数字为主,点 tile 开抽屉预过滤) */}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2">
                {typeGroups.map(([t, n]) => (
                  <button key={t} type="button" onClick={() => openDrawer({ kind: 'type', value: t })}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,92,255,.5)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line }}
                    className="[font-family:inherit] cursor-pointer text-left border border-solid border-line bg-white/[.03] rounded-[12px] py-[10px] px-3 text-ink transition-[border-color] duration-[160ms]">
                    <div className="text-[20px] font-bold tabular-nums">{n}</div>
                    <div className="text-[11px] text-mut mt-[2px] truncate">{t}</div>
                  </button>
                ))}
              </div>
              {typeGroups.length === 1 && typeGroups[0][0] === '未分类' && (
                <div className="text-[11.5px] text-mut mt-2">点右上「批量生成元数据」,AI 会把它们自动归类。</div>
              )}
              {/* 最近入库 ≤5:type chip + 标题 + 日期,点行开抽屉并展开该篇 */}
              <div className="text-[11.5px] text-mut mt-[14px] mx-[2px] mb-[2px]">最近入库</div>
              {recentDocs.map((d) => (
                <div className="kbrow cursor-pointer" key={d.id}
                  onClick={() => {
                    openDrawer(null)
                    if (expandedId !== d.id) void toggleExpand(d.id)
                    setTimeout(() => document.getElementById('kbdoc-' + d.id)?.scrollIntoView({ block: 'start' }), 300)
                  }}>
                  <span className="pth"><span className="chip mr-[6px] text-[10px]">{(d.type || '').trim() || '未分类'}</span><b>{d.title}</b></span>
                  <span className="meta">{d.created_at.slice(0, 10)}</span>
                </div>
              ))}
            </>
          )}
          {metaNote && <div className="text-[12px] text-mut py-[6px] px-[2px]">{metaNote}</div>}
        </div>

        <aside className="grid gap-[14px]">
          <div className="ckcard p-4">
            <div className="text-[14px] font-bold text-white mb-[10px]">可复用资产 · 沉淀层 <span className="text-[11px] text-mut font-normal">{assetGroups.length ? `${assetGroups.length} 类` : '空'}</span></div>
            {assetGroups.length === 0 ? (
              <div className="text-mut text-[12.5px] py-1">暂无可复用资产。给文档打标签后，会在此按标签自动聚合。</div>
            ) : (
              <div>
                {assetGroups.map(([group, items]) => (
                  <button key={group} type="button" onClick={() => openDrawer({ kind: 'tag', value: group })}
                    className="flex items-center gap-2 w-full text-left [font-family:inherit] cursor-pointer bg-transparent border-x-0 border-t-0 border-b border-solid border-line py-2 px-[2px] text-ink-2 text-[12.5px]">
                    <span className="text-brand-gold">#</span>{group}
                    <span className="ml-auto text-mut tabular-nums">{items.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 「库存健康」卡已删(首屏减负,2026-07):索引状态/引擎与脉搏卡完全重复 */}
        </aside>
      </div>

      {/* ③ 图片资产：生图素材 + img2img + 效果图画廊 */}
      <GroupLabel hint={cur ? `当前项目 · ${cur.name} · 上传 / 文档抽取 / AI 生图` : '未选择项目'}>③ 图片资产</GroupLabel>
      <div className="ckcard p-[18px]" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)' } as React.CSSProperties}>
        {!cur ? (
          <div className="gallery"><div className="gempty">请先选择项目。</div></div>
        ) : (() => {
          const mats = assets.filter((a) => MAT_TYPES.includes(a.asset_type))
          const shown = assetTab === 'all' ? assets : assets.filter((a) => a.asset_type === assetTab)
          return (
            <>
              <div className="matlabel flex gap-[6px] flex-wrap items-center mt-[2px]">
                <span className="self-center">效果图成果</span>
                <span className="flex-1" />
                {ASSET_TABS.map((t) => {
                  const n = t.key === 'all' ? assets.length : assets.filter((a) => a.asset_type === t.key).length
                  return (
                    <button key={t.key} className="anbtn" onClick={() => setAssetTab(t.key)} style={assetTab === t.key ? anbtnOn : undefined}>{t.label}（{n}）</button>
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
                        <select title="改分类" value="" onChange={(e) => { if (e.target.value) reclassAsset(a.id, e.target.value) }} className="h-7 text-[11px] border-0 rounded-[8px] bg-[rgba(20,22,30,.92)] text-ink cursor-pointer">
                          <option value="">分类…</option>
                          {RECLASS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </select>
                        <a href={api.assetImageUrl(cur.id, a.id)} target="_blank" rel="noreferrer" title="查看原图" className="w-7 h-7 rounded-[8px] bg-[rgba(20,22,30,.92)] text-ink flex items-center justify-center no-underline"><ZoomIn size={14} /></a>
                        <a href={api.assetImageUrl(cur.id, a.id)} download title="下载原图" className="w-7 h-7 rounded-[8px] bg-[rgba(20,22,30,.92)] text-ink flex items-center justify-center no-underline">⬇</a>
                        <button className="gx" title="移除(软隐藏,可恢复,不删原文件)" onClick={() => removeAsset(a.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                  {shown.length > galleryShown && (
                    <div className="gempty col-span-full">
                      <button className="anbtn" title="每次 6 张" onClick={() => setGalleryShown((n) => n + 6)}>加载更多</button> <span className="text-[11px] text-mut">已显示 {Math.min(galleryShown, shown.length)} / {shown.length}</span>
                    </div>
                  )}
                </div>
              )}

              {removed.length > 0 && (
                <div className="mt-[10px]">
                  <button className="anbtn text-[11px]" onClick={() => setShowRemoved((v) => !v)}>已移除（{removed.length}）{showRemoved ? ' 收起 ▴' : ' 查看 ▾'}</button>
                  {showRemoved && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {removed.slice(0, 40).map((a) => (
                        <div key={a.id} className="flex flex-col items-center gap-[3px]">
                          <img src={api.assetThumbUrl(cur.id, a.id)} alt={a.caption.slice(0, 12) || '已移除'} title={a.caption} className="w-[72px] h-[54px] object-cover rounded-[6px] border border-solid border-line opacity-[.55]" />
                          <button className="anbtn text-[10px] py-px px-[7px]" onClick={() => restoreAsset(a.id)}>恢复</button>
                        </div>
                      ))}
                      {removed.length > 40 && <div className="self-center text-[11px] text-mut">…共 {removed.length} 张</div>}
                    </div>
                  )}
                </div>
              )}

              {/* AI 生图工坊:降为卡内折叠(默认收;img2img 是花钱动作,多一次点击=保护),功能与 runImg2Img 逻辑原样 */}
              <div className="border-x-0 border-b-0 border-t border-solid border-line mt-[14px]">
                <button type="button" onClick={() => setWorkshopOpen((v) => !v)}
                  className="w-full text-left [font-family:inherit] cursor-pointer bg-transparent border-0 pt-3 px-0 pb-1 flex items-center gap-2 text-ink">
                  <span className="text-mut">{workshopOpen ? '▾' : '▸'}</span>
                  <span className="text-[13.5px] font-bold text-white">AI 生图工坊</span>
                  <span className="text-[11px] text-mut">{mats.length > 0 ? `图生图 · ${Math.min(mats.length, 4)} 张素材作参考` : '文生图 · 暂无素材'}</span>
                  {mats.length > 0 && <span className="text-[10.5px] text-brand-cyan border border-solid border-brand-cyan/40 bg-brand-cyan/[.12] rounded-[99px] py-[2px] px-2">素材 {mats.length}</span>}
                </button>
                {workshopOpen && (
                  <div className="matwrap">
                    <div className="matlabel">生图素材 · 把图分类为 参考图 / 白模 / 材质 即成为素材</div>
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
                          <span className="text-muted-foreground">注入提示词</span>
                          <div className="promptchips">
                            {['控制视角', '保持构图', ...mats.slice(0, 4).map((m, i) => `参考图${i + 1}·${TYPE_CN[m.asset_type]}`)].map((c, i) => (
                              <span className="pchip" key={i}>{c}</span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                    {mats.length > 0 && (
                      <div className="flex gap-2 mt-2 items-center flex-wrap">
                        <input value={img2imgPrompt} onChange={(e) => setImg2imgPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runImg2Img(mats.slice(0, 4).map((m) => m.id)) }} placeholder="描述要生成的效果图（以上方素材为参考图）…" className={`flex-1 min-w-[240px] py-2 px-3 rounded-[8px] ${fieldCls}`} />
                        <button className={`btn ${gradBtn}`} disabled={img2imgBusy || !img2imgPrompt.trim()} onClick={() => runImg2Img(mats.slice(0, 4).map((m) => m.id))} title={`用这 ${Math.min(mats.length, 4)} 张素材作参考图生成（约 30-60s）`}>{img2imgBusy ? '生成中…' : '素材生图'}</button>
                      </div>
                    )}
                    {img2imgMsg && <div className="text-[11.5px] text-ink-2 mt-1">{img2imgMsg}</div>}
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>

      {/* ④ 跨项目复用库（已暗，全局翻暗即生效） */}
      <GroupLabel hint="B1–B6 · 已沉淀(只读)">④ 跨项目复用库</GroupLabel>
      <CrossProjectLibrary />

      {/* 已入库文档 · 全部:右滑抽屉(复用 .setmask/.setdrawer 全局类;始终挂载靠 show 类切换保滑入动画)
          原 ② 卡的全量列表整块迁到这里,expandedId/detailCache/toggleExpand/genMeta/del 逻辑零改动 */}
      <div className={'setmask' + (docsDrawerOpen ? ' show' : '')} onClick={() => setDocsDrawerOpen(false)} />
      <aside className={'setdrawer w-[min(680px,94vw)] z-[42]' + (docsDrawerOpen ? ' show' : '')}>
        <div className="sethead">
          <span className="sett">已入库文档 · {drawerDocs.length}{drawerFilter ? ` / ${docs.length}` : ''}</span>
          <button className="setx" onClick={() => setDocsDrawerOpen(false)}>✕</button>
        </div>
        <div className="pt-3 px-5 pb-0 flex gap-[6px] flex-wrap flex-none">
          <button className="anbtn" style={!drawerFilter ? anbtnOn : undefined} onClick={() => setDrawerFilter(null)}>全部（{docs.length}）</button>
          {typeGroups.map(([t, n]) => (
            <button key={t} className="anbtn" style={drawerFilter?.kind === 'type' && drawerFilter.value === t ? anbtnOn : undefined} onClick={() => setDrawerFilter({ kind: 'type', value: t })}>{t}（{n}）</button>
          ))}
          {drawerFilter?.kind === 'tag' && <button className="anbtn" style={anbtnOn} onClick={() => setDrawerFilter(null)}>#{drawerFilter.value} ✕</button>}
        </div>
        <div className="flex-1 overflow-y-auto pt-2 px-5 pb-5">
          {drawerDocs.length === 0 && <div className="text-mut text-[12px] p-2">该类暂无文档。</div>}
          {drawerDocs.map((d) => {
            const expanded = expandedId === d.id
            const det = detailCache[d.id]
            const parseStatus = det ? (det.content_text.trim() ? '已解析入库' : '仅元数据登记') : '加载中…'
            return (
              <div className="rgroup" key={d.id} id={'kbdoc-' + d.id}>
                <div className="kbrow flex-wrap">
                  <span className="pth cursor-pointer" onClick={() => toggleExpand(d.id)}>
                    <span className="text-mut mr-1">{expanded ? '▾' : '▸'}</span>
                    {d.type && <span className="chip mr-[6px] text-[10px]">{d.type}</span>}
                    <b>{d.title}</b>
                    {d.tags && <span className="text-mut ml-2">#{d.tags}</span>}
                  </span>
                  <span className="meta">{d.file_type}</span>
                  <span className="act text-brand-purple" onClick={() => genMeta(d.id)} style={{ opacity: genningId === d.id ? 0.5 : 1 }}>{genningId === d.id ? '生成中…' : 'AI 生成元数据'}</span>
                  <span className="act text-brand-red" onClick={() => del(d.id)}>删除</span>
                </div>
                {expanded && (
                  <div className="w-full mt-[6px] py-2 px-[10px] bg-white/[.03] rounded-[8px] text-[12.5px]">
                    <div className="kvline"><span className="kvk">文件名</span>{d.title}</div>
                    <div className="kvline"><span className="kvk">文件类型</span>{d.file_type}{d.type ? ` · ${d.type}` : ''}</div>
                    <div className="kvline"><span className="kvk">来源路径</span><span className="mono break-all">{d.source_path || '—'}</span></div>
                    <div className="kvline"><span className="kvk">来源说明</span>{d.resource || '—'}</div>
                    <div className="kvline"><span className="kvk">摘要</span>{d.description ? renderInline(d.description) : '（未生成，可点「AI 生成元数据」）'}</div>
                    <div className="kvline"><span className="kvk">入库方式</span>复制接入（原文件不动，系统留受管副本）</div>
                    <div className="kvline"><span className="kvk">解析状态</span>{parseStatus}</div>
                    <div className="kvline items-start">
                      <span className="kvk">内容片段</span>
                      <span className="whitespace-pre-wrap text-ink-2">
                        {det ? (det.content_text.trim() ? det.content_text.slice(0, 500) + (det.content_text.length > 500 ? ' …' : '') : '（无正文，仅登记元数据）') : '加载中…'}
                      </span>
                    </div>
                    <div className="mt-[6px]">
                      <button className="anbtn" disabled={genningId === d.id} onClick={() => genMeta(d.id)}>{genningId === d.id ? '生成中…' : 'AI 生成元数据'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {metaNote && <div className="text-[12px] text-mut py-[6px] px-[2px]">{metaNote}</div>}
        </div>
      </aside>

      {err && <div className="text-brand-red text-[12px] mt-2">错误：{err}</div>}
    </div>
  )
}

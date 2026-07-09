import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type { FileAsset } from '@/lib/api'

import { knowledgeService as ks } from '../../services'
import { CardHead } from '../common/GlassCard'
import { GhostButton, Label, Pill } from '../common/PillButton'

/* ═══ 图片资产池(海天全高抽屉 · Portal 到 #sk-overlay) ═══
   项目从 PPT/PDF/Word 抽出的图(效果图/总图/参考案例…)作为一等资产集中呈现。
   左网格 + 右详情两栏:左侧按 asset_type 过滤缩略图网格,右侧看大图/改类型/定位原文件。
   三态诚实:加载中 / 失败(红字) / 空态(暂无X。下一步指引。)一律如实,不编数据。
   asset_type 是「资产轴」8 类(区别于文档 design_doc_type),计数/标签全来自真实拉取。 */

/* 8 类 asset_type → 中文标签(与后端 image_assets.asset_type 对应) */
const TYPE_LABEL: Record<string, string> = {
  render: '效果图',
  reference: '参考案例',
  plan: '总图/平面',
  model: '白模体块',
  material: '材质',
  logo: 'Logo',
  extracted: '未归类',
  image: '未分类',
}
/* 过滤 chip / 改类型下拉的固定展示顺序 */
const TYPE_ORDER = ['render', 'reference', 'plan', 'model', 'material', 'logo', 'extracted', 'image'] as const

/* 扩展名标签(去前导点、大写;空则占位 IMG) */
const fmtExt = (e: string) => (e || '').replace(/^\./, '').toUpperCase() || 'IMG'

interface Props {
  open: boolean
  onClose: () => void
  projectId: number | null
  projectName?: string
  allProjects?: boolean /* true:跨项目视图(数据基地入口),读 listAllAssets,不受单项目作用域(bug2 根治) */
}

/* 内部统一用带项目归属的资产形状(单项目模式 project_id 补当前项目) */
type Asset = FileAsset & { project_id: number; project_name?: string }

export function ImageAssetPool({ open, onClose, projectId, projectName, allProjects = false }: Props) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('') /* 列表加载失败(占据网格区) */
  const [filter, setFilter] = useState<string>('all') /* 'all' | asset_type */
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [fileNames, setFileNames] = useState<Record<number, string>>({}) /* source_file_id → 源文件名(可选映射) */
  const [saveErr, setSaveErr] = useState('') /* 改类型失败(详情区) */
  const [savingType, setSavingType] = useState(false)
  const [revealErr, setRevealErr] = useState('') /* 定位原文件失败(详情区) */

  const finishedRef = useRef(false) /* 迟到守卫:关闭后异步回调不再 setState */

  /* 拉资产 + 源文件名映射(名字映射失败不阻断资产展示) */
  const load = useCallback(async () => {
    if (!allProjects && projectId == null) return
    setLoading(true)
    setErr('')
    try {
      if (allProjects) {
        const r = await ks.listAllAssets()
        if (finishedRef.current) return
        setAssets(r.items as Asset[])
        setTotal(r.total)
        /* 跨项目模式:源文件名映射跨项目不便,退回 caption / 资产 #id,不拉 */
      } else {
        const pid = projectId as number
        const r = await ks.listAssets(pid)
        if (finishedRef.current) return
        setAssets(r.items.map((a) => ({ ...a, project_id: pid })))
        setTotal(r.total)
        try {
          const f = await ks.listProjectFiles(pid)
          if (finishedRef.current) return
          const map: Record<number, string> = {}
          for (const it of f.items) map[it.id] = it.filename
          setFileNames(map)
        } catch {
          /* 源文件名仅用于更友好的显示,拉不到就退回 caption / 资产 #id */
        }
      }
    } catch (e) {
      if (finishedRef.current) return
      setErr((e as Error).message)
    } finally {
      if (!finishedRef.current) setLoading(false)
    }
  }, [projectId, allProjects])

  /* 打开:复位 + 拉取;关闭:置 finished 守卫迟到回调 */
  useEffect(() => {
    if (open && (allProjects || projectId != null)) {
      finishedRef.current = false
      setFilter('all')
      setSelectedId(null)
      setSaveErr('')
      setRevealErr('')
      setAssets([])
      setTotal(0)
      setLoading(true)
      void load()
    } else {
      finishedRef.current = true
    }
  }, [open, projectId, allProjects, load])

  /* 资产池是资产数据的消费者:入库抽图完成(knowledge-updated)时,若抽屉开着则重拉 */
  useEffect(() => {
    if (!open || (!allProjects && projectId == null)) return
    const onUpd = () => { void load() }
    window.addEventListener('romai:knowledge-updated', onUpd)
    return () => window.removeEventListener('romai:knowledge-updated', onUpd)
  }, [open, projectId, allProjects, load])

  /* 每类真实数量(来自已拉取资产) */
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of assets) c[a.asset_type] = (c[a.asset_type] ?? 0) + 1
    return c
  }, [assets])

  /* 过滤后的网格数据 */
  const shown = useMemo(
    () => (filter === 'all' ? assets : assets.filter((a) => a.asset_type === filter)),
    [assets, filter],
  )

  /* 当前选中资产(随 assets 变化重算,改类型后详情同步) */
  const selected = useMemo(() => assets.find((a) => a.id === selectedId) ?? null, [assets, selectedId])

  /* 改类型:PATCH 成功后就地更新本地状态(只改登记,不删图)。用资产自身 project_id(跨项目模式各图归属不同) */
  const onChangeType = useCallback(
    async (asset: Asset, newType: string) => {
      if (newType === asset.asset_type) return
      setSavingType(true)
      setSaveErr('')
      try {
        await ks.updateAsset(asset.project_id, asset.id, { asset_type: newType })
        if (finishedRef.current) return
        setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, asset_type: newType } : a)))
      } catch (e) {
        if (!finishedRef.current) setSaveErr((e as Error).message)
      } finally {
        if (!finishedRef.current) setSavingType(false)
      }
    },
    [],
  )

  /* 定位原文件(资源管理器);失败如实红字。用资产自身 project_id */
  const onReveal = useCallback(
    async (assetProjectId: number, sourceFileId: number) => {
      if (sourceFileId <= 0) return
      setRevealErr('')
      try {
        await ks.revealProjectFile(assetProjectId, sourceFileId)
      } catch (e) {
        if (!finishedRef.current) setRevealErr((e as Error).message)
      }
    },
    [],
  )

  if (!open) return null
  const overlay = document.getElementById('sk-overlay')
  if (!overlay) return null

  const locked = !allProjects && projectId == null

  /* 名字:caption 首行 → 源文件名 → 资产 #id */
  const nameOf = (a: FileAsset): string => {
    const cap = (a.caption || '').split('\n')[0].trim()
    if (cap) return cap
    const fn = fileNames[a.source_file_id]
    if (fn) return fn
    return `资产 #${a.id}`
  }

  /* 角标:PDF 页(page_no) 优先,否则 PPT 页(slide_no),都以 P{n} 呈现 */
  const cornerBadge = (a: FileAsset): string | null => {
    if (a.page_no > 0) return `P${a.page_no}`
    if (a.slide_no > 0) return `P${a.slide_no}`
    return null
  }

  return createPortal(
    <div
      className="absolute inset-0 z-skoverlay flex justify-end bg-[rgba(6,8,10,.5)] backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pointer-events-auto flex h-full w-[min(1080px,96vw)] flex-col overflow-hidden border-l-[0.5px] border-sk-border bg-[rgba(10,12,14,.97)] shadow-skpop">
        {/* 顶部:标题 + 当前项目 + 类型过滤 chips */}
        <div className="flex-none border-b-[0.5px] border-sk-hairsoft px-6 pb-3 pt-5">
          <CardHead
            title="图片资产池"
            en="Asset Pool"
            right={<GhostButton className="px-3 py-1" onClick={onClose}>关闭</GhostButton>}
          />
          <div className="mt-2 font-skcjk text-[11.5px] tracking-[0.04em] text-sk-muted2">
            {allProjects ? (
              <>全部项目 · <span className="text-sk-muted">{total} 张图片资产</span></>
            ) : locked ? (
              '请先选择项目'
            ) : (
              <>当前项目 · <span className="text-sk-muted">{projectName || `#${projectId}`}</span></>
            )}
          </div>
          {!locked && !loading && !err && total > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>全部 {total}</FilterChip>
              {TYPE_ORDER.filter((t) => (counts[t] ?? 0) > 0).map((t) => (
                <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
                  {TYPE_LABEL[t]} {counts[t]}
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        {/* 主体:左网格 + 右详情两栏 */}
        <div className="flex min-h-0 flex-1">
          {locked ? (
            <div className="flex flex-1 items-center justify-center px-6 text-center font-skcjk text-[12.5px] font-light text-sk-muted2">
              请先选择项目。
            </div>
          ) : (
            <>
              {/* ── 左:缩略图网格 ── */}
              <div className="sk-scroll min-w-0 flex-1 overflow-y-auto px-6 py-5">
                {loading ? (
                  <div className="py-16 text-center font-skcjk text-[12.5px] text-sk-muted2">加载中…</div>
                ) : err ? (
                  <div className="py-8 font-skcjk text-[12px] font-light leading-[1.7] text-sk-risk">{err}</div>
                ) : total === 0 ? (
                  <div className="mx-auto max-w-[420px] py-16 text-center font-skcjk text-[12px] font-light leading-[1.9] text-sk-muted">
                    暂无图片资产。到数据基地「一键清理」接入含图的 PPT/PDF/Word,或上传图片后,资产会出现在这里。
                  </div>
                ) : shown.length === 0 ? (
                  <div className="py-16 text-center font-skcjk text-[12px] font-light text-sk-muted2">
                    该类型暂无资产。切到「全部」查看其它类型。
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-3">
                    {shown.map((a) => (
                      <AssetCell
                        key={a.id}
                        thumbUrl={ks.assetThumbUrl(a.project_id, a.id)}
                        ext={a.ext}
                        name={nameOf(a)}
                        typeLabel={TYPE_LABEL[a.asset_type] ?? a.asset_type}
                        subLabel={allProjects ? a.project_name : undefined}
                        badge={cornerBadge(a)}
                        selected={a.id === selectedId}
                        onClick={() => setSelectedId(a.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* ── 右:详情 ── */}
              <div className="flex w-[300px] flex-none flex-col border-l-[0.5px] border-sk-hairsoft">
                {selected ? (
                  <div className="sk-scroll flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
                    {/* 大图 + 尺寸角标 */}
                    <div className="relative flex items-center justify-center overflow-hidden rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card">
                      <BigImage src={ks.assetImageUrl(selected.project_id, selected.id)} ext={selected.ext} />
                      {selected.width > 0 && selected.height > 0 && (
                        <span className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-[rgba(6,8,10,.72)] px-1.5 py-0.5 font-sans text-[9.5px] text-sk-muted [font-variant-numeric:tabular-nums]">
                          {selected.width} × {selected.height}
                        </span>
                      )}
                    </div>

                    {/* 名字 / 源文件 / 说明 */}
                    <div className="flex flex-col gap-1.5">
                      <div className="break-all font-skcjk text-[12.5px] leading-[1.6] text-sk-fg">{nameOf(selected)}</div>
                      {allProjects && selected.project_name && (
                        <div className="font-skcjk text-[10.5px] font-light text-sk-primary">项目 · {selected.project_name}</div>
                      )}
                      {fileNames[selected.source_file_id] && (
                        <div className="break-all font-skcjk text-[10.5px] font-light text-sk-muted2">
                          源文件 · {fileNames[selected.source_file_id]}
                        </div>
                      )}
                      {(selected.caption || '').trim() && (
                        <div className="break-words font-skcjk text-[11px] font-light leading-[1.7] text-sk-muted">{selected.caption}</div>
                      )}
                    </div>

                    {/* 改类型 */}
                    <div className="flex flex-col gap-2">
                      <Label>改类型</Label>
                      <div className="flex items-center gap-2">
                        <span className="font-skcjk text-[11px] text-sk-muted2">当前</span>
                        <Pill tone="pri">{TYPE_LABEL[selected.asset_type] ?? selected.asset_type}</Pill>
                      </div>
                      <select
                        className="w-full cursor-pointer rounded-[9px] border-[0.5px] border-sk-hairsoft bg-sk-card px-2.5 py-1.5 font-skcjk text-[11.5px] text-sk-fg outline-none transition-colors focus:border-[rgba(127,179,207,.5)] disabled:opacity-45"
                        value={selected.asset_type}
                        disabled={savingType}
                        onChange={(e) => void onChangeType(selected, e.target.value)}
                      >
                        {TYPE_ORDER.map((t) => (
                          <option key={t} value={t} className="bg-sk-card text-sk-fg">{TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                      {savingType && <div className="font-skcjk text-[10.5px] text-sk-primary">保存中…</div>}
                      {saveErr && <div className="font-skcjk text-[10.5px] font-light text-sk-risk">{saveErr}</div>}
                    </div>

                    {/* 定位原文件 + 用于报告(占位) */}
                    <div className="flex flex-col gap-2 border-t-[0.5px] border-sk-hairsoft pt-3">
                      {selected.source_file_id > 0 && (
                        <GhostButton className="w-full" onClick={() => void onReveal(selected.project_id, selected.source_file_id)}>
                          打开原文件位置
                        </GhostButton>
                      )}
                      {revealErr && <div className="font-skcjk text-[10.5px] font-light leading-[1.6] text-sk-risk">{revealErr}</div>}
                      <button
                        disabled
                        className="w-full cursor-not-allowed rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-5 py-2 font-skcjk text-[11.5px] font-normal tracking-[0.14em] text-sk-muted2 opacity-45"
                      >
                        用于报告
                      </button>
                      <div className="font-skcjk text-[10px] font-light leading-[1.6] text-sk-muted2">
                        「用于报告」为后续报告配图预留,本轮不实现。
                      </div>
                    </div>
                  </div>
                ) : total > 0 && !loading && !err ? (
                  <div className="flex flex-1 items-center justify-center px-6 text-center font-skcjk text-[11.5px] font-light leading-[1.8] text-sk-muted2">
                    选择左侧任一图片查看详情。
                  </div>
                ) : (
                  <div className="flex-1" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    overlay,
  )
}

/* 类型过滤 chip(激活=海天蓝描边底) */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border-[0.5px] px-3 py-1 font-skcjk text-[10.5px] tracking-[0.06em] transition-all duration-200 ${
        active
          ? 'border-[rgba(127,179,207,.55)] bg-[rgba(127,179,207,.12)] text-sk-primary'
          : 'border-sk-hairsoft text-sk-muted2 hover:border-[rgba(127,179,207,.35)] hover:text-sk-muted'
      }`}
    >
      {children}
    </button>
  )
}

/* 网格单元:缩略图(加载失败退回扩展名占位)+ 名字 + 类型 Pill + 页角标 */
function AssetCell({
  thumbUrl,
  ext,
  name,
  typeLabel,
  subLabel,
  badge,
  selected,
  onClick,
}: {
  thumbUrl: string
  ext: string
  name: string
  typeLabel: string
  subLabel?: string
  badge: string | null
  selected: boolean
  onClick: () => void
}) {
  const [broken, setBroken] = useState(false)
  return (
    <button
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-sktile border-[0.5px] bg-sk-card p-1.5 text-left transition-all duration-200 ${
        selected
          ? 'border-[rgba(127,179,207,.55)] bg-[rgba(127,179,207,.08)]'
          : 'border-sk-hairsoft hover:border-[rgba(127,179,207,.35)]'
      }`}
    >
      <div className="relative overflow-hidden rounded-[7px] bg-sk-card">
        {broken ? (
          <div className="flex h-24 w-full items-center justify-center font-skmono text-[10.5px] tracking-wider text-sk-muted2">
            {fmtExt(ext)}
          </div>
        ) : (
          <img
            src={thumbUrl}
            alt={name}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-24 w-full object-cover"
          />
        )}
        {badge && (
          <span className="absolute right-1 top-1 rounded-[5px] bg-[rgba(6,8,10,.72)] px-1.5 py-0.5 font-sans text-[9.5px] font-medium text-sk-muted [font-variant-numeric:tabular-nums]">
            {badge}
          </span>
        )}
      </div>
      <span className="truncate font-skcjk text-[10.5px] text-sk-muted">{name}</span>
      <div className="flex items-center gap-1.5">
        <Pill className="self-start px-2 py-0.5 text-[9.5px] tracking-[0.06em]">{typeLabel}</Pill>
        {subLabel && <span className="truncate font-skcjk text-[9px] font-light text-sk-primary">{subLabel}</span>}
      </div>
    </button>
  )
}

/* 详情大图:等比 contain;加载失败退回扩展名占位 */
function BigImage({ src, ext }: { src: string; ext: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className="flex h-[200px] w-full items-center justify-center font-skmono text-[12px] tracking-wider text-sk-muted2">
        {fmtExt(ext)}
      </div>
    )
  }
  return <img src={src} alt="" onError={() => setBroken(true)} className="block max-h-[340px] w-full object-contain" />
}

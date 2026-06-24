import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, type WorkspaceScan } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import CrossProjectLibrary from './CrossProjectLibrary'
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

/** 数据基地：本地文件夹接入 → 一键整理 → 索引展示 的主入口。
 *  核心动作:选择/授权本地文件夹、一键整理、看整理结构与索引状态、看已入库文件、对单文件生成 AI 元数据、删错误条目。
 *  技术说明:全文检索走本地 FTS5 / BM25(SQLite)。所有按钮都接真实 API、不伪造、不留无效占位。 */
export default function KnowledgePage() {
  const { cur } = useProject()
  const [docs, setDocs] = useState<KnowledgeDocListItem[]>([])
  const [detail, setDetail] = useState<KnowledgeDoc | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [genningId, setGenningId] = useState<number | null>(null)
  const [metaNote, setMetaNote] = useState<string | null>(null)
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [ws, setWs] = useState<{ workspace_path: string; accessible: boolean } | null>(null)

  // 一键整理:结构(preview.projects) + 数量/类型/大文件(scan) 合成的整理报告;接入结果落 ingestResult。
  const [report, setReport] = useState<{ scan: WorkspaceScan; preview: BatchIngestPreview } | null>(null)
  const [organizing, setOrganizing] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [ingestResult, setIngestResult] = useState<BatchIngestImport | null>(null)

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
  const [open, setOpen] = useState<Record<string, boolean>>({ src: true, docs: true, files: false, assets: false })
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

  useEffect(() => {
    loadDocs()
    api.workspaceStatus().then(setWs).catch(() => setWs(null))
    loadStats()
  }, [loadDocs, loadStats])

  const del = async (id: number) => {
    setErr(null)
    try {
      await api.deleteKnowledgeDoc(id)
      if (detail?.id === id) setDetail(null)
      loadDocs()
      loadStats()
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

  /** 主入口:选择本地文件夹(用现有 workspace 根机制,输入绝对路径) → 扫描结构 + 预览可接入(只读,未改任何数据)。 */
  const organize = async () => {
    if (organizing) return
    setErr(null)
    let root = ws?.workspace_path
    if (!root || !ws?.accessible) {
      const p = window.prompt('输入要整理的本地文件夹绝对路径（如 C:\\Users\\你\\项目资料）：', root || '')
      if (!p || !p.trim()) return
      try {
        const w = await api.workspaceConfig(p.trim())
        setWs(w)
        root = w.workspace_path
        if (!w.accessible) {
          setErr(`路径不可达：${root}（请确认是本机真实存在的文件夹绝对路径）`)
          return
        }
      } catch (e) {
        setErr((e as Error).message)
        return
      }
    }
    setOrganizing(true)
    setReport(null)
    setIngestResult(null)
    try {
      const [scan, preview] = await Promise.all([api.workspaceScan(), api.previewBatchIngest(root)])
      if (!scan.accessible) {
        setErr(`目录不可访问：${scan.error || root}`)
        return
      }
      setReport({ scan, preview })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setOrganizing(false)
    }
  }

  /** 接入并建立索引:复制可解析文件 + 写项目中心 + 入本地索引(真实写库,需确认)。 */
  const ingest = async () => {
    const root = report?.preview.root || ws?.workspace_path
    if (!root || ingesting) return
    if (!window.confirm('确认接入可解析文件并建立索引？原始目录不动，系统复制文件并写入项目中心 + 本地索引。')) return
    setIngesting(true)
    setErr(null)
    try {
      const r = await api.importBatchIngest(root)
      setIngestResult(r)
      await loadDocs()
      loadStats()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setIngesting(false)
    }
  }

  const topTypes = report ? Object.entries(report.scan.type_stats).sort((a, b) => b[1] - a[1]).slice(0, 10) : []

  return (
    <>
      <div className="ptitle">
        <h1>数据基地</h1>
        <span className="statpill live" style={{ marginLeft: 8 }}>本地索引 · 已接入</span>
      </div>

      {/* 数据源:单一主入口「选择文件夹并整理」+ 整理报告(只读预览) */}
      <section className="sec" data-open={open.src ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('src')}>
          <span className="chev">▸</span>
          <span className="stitle">数据源 · 一键整理</span>
          <span className="scount">{ws?.workspace_path ? (ws.accessible ? '已授权' : '路径不可达') : '未选择'}</span>
          <span className="shint">选择本地文件夹 → 整理结构 → 接入索引</span>
        </button>
        <div className="secbody">
          {ws?.workspace_path && (
            <div className="kbrow">
              <span className="pth mono">{ws.workspace_path}</span>
              <span className="meta mono">{ws.accessible ? '可访问' : '路径不可达'}</span>
            </div>
          )}
          <div className="btnrow">
            <button className="btn" onClick={organize} disabled={organizing}>
              {organizing ? '整理中…' : '📂 选择文件夹并整理'}
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--mut)', margin: '6px 2px 0' }}>
            读取本地文件夹（输入绝对路径授权），扫描结构与文件类型、预览可解析/不可解析，只读不改动；确认后再复制接入并建立本地索引。
          </div>

          {report && (
            <div className="card" style={{ marginTop: 12, background: 'var(--panel2)' }}>
              <div className="ct">整理报告（只读预览，未移动/未写入任何文件）</div>
              {/* 数量与类型 */}
              <div className="grid3" style={{ marginTop: 6 }}>
                <div className="metric"><div className="l">📄 文件总数</div><div className="v">{report.scan.total_files}</div></div>
                <div className="metric"><div className="l">📁 文件夹</div><div className="v">{report.scan.total_dirs}</div></div>
                <div className="metric"><div className="l">💾 总大小</div><div className="v" style={{ fontSize: 20 }}>{fmtSize(report.scan.total_size)}</div></div>
              </div>
              {/* 可解析 / 大文件 / 不可解析 状态 */}
              <div className="grid3" style={{ marginTop: 8 }}>
                <div className="metric"><div className="l">✅ 可解析(待接入)</div><div className="v t">{report.preview.total_supported}</div></div>
                <div className="metric"><div className="l">⚠ 大文件</div><div className="v">{report.scan.large_files.length}</div></div>
                <div className="metric"><div className="l">⛔ 不可解析</div><div className="v">{report.preview.total_unsupported}</div></div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)', margin: '6px 2px' }}>
                当前数据基地已入库 <b>{stats?.documents ?? docs.length}</b> 条 · 本次扫描可接入 <b>{report.preview.total_supported}</b> 条（待处理）
              </div>
              {report.preview.total_projects > 1 && report.scan.total_files > report.preview.total_supported + report.preview.total_unsupported && (
                <div style={{ fontSize: 11, color: 'var(--mut)', margin: '0 2px 6px' }}>
                  注：该文件夹含多个子项目，按子文件夹接入；直接散落在根目录、不属于任何子项目的文件本次不接入。
                </div>
              )}

              {/* 识别到的项目/文件夹结构 */}
              {report.preview.projects.length > 0 && (
                <>
                  <div className="ct" style={{ marginTop: 8 }}>识别到的项目/文件夹结构（{report.preview.total_projects}）</div>
                  {report.preview.projects.map((p) => (
                    <div className="kbrow" key={p.path}>
                      <span className="pth">📁 {p.project_name}</span>
                      <span className="meta">{p.supported_count} 可解析 / {p.unsupported_count} 不支持</span>
                    </div>
                  ))}
                </>
              )}

              {/* 文件类型分布 */}
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
              {report.scan.large_files.length > 0 && (
                <>
                  <div className="ct" style={{ marginTop: 8 }}>大文件（登记元数据，不阻塞）</div>
                  {report.scan.large_files.slice(0, 5).map((f) => (
                    <div className="kbrow" key={f.abs_path}>
                      <span className="pth">{f.path}</span>
                      <span className="meta" style={{ color: 'var(--terra)' }}>{fmtSize(f.size)}</span>
                    </div>
                  ))}
                </>
              )}

              <div className="btnrow" style={{ marginTop: 10 }}>
                <button className="btn" onClick={ingest} disabled={ingesting || report.preview.total_supported === 0}
                        style={{ background: 'var(--terra)', color: '#fff' }}>
                  {ingesting ? '接入中…' : `确认接入并建立索引（${report.preview.total_supported} 条）`}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 库存与健康:不可折叠,默认展开——承担整理结果 / 索引状态 / 文件健康 展示 */}
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

          {/* 最近一次接入结果(整理→接入后的真实落库统计) */}
          {ingestResult && (
            <div className="card" style={{ marginTop: 10, background: 'var(--panel2)' }}>
              <div className="ct">最近一次接入结果</div>
              <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
                已复制 <b>{ingestResult.copied}</b> · 已入库索引 <b>{ingestResult.indexed}</b> · 跳过重复{' '}
                <b>{ingestResult.skipped_existing}</b> · 失败 <b>{ingestResult.failed}</b>
              </div>
              {ingestResult.projects.map((p) => (
                <div className="kbrow" key={p.project_id}>
                  <span className="pth">{p.project_name}</span>
                  <span className="meta">{p.copied} 复制 / {p.indexed} 入库 / {p.failed} 失败</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 已入库文档:列表 + 单条 AI 元数据 / 删除(核心动作) */}
      <section className="sec" data-open={open.docs ? '1' : '0'}>
        <button className="sechead" type="button" onClick={() => toggle('docs')}>
          <span className="chev">▸</span>
          <span className="stitle">已入库文档</span>
          <span className="scount">{docs.length}</span>
          <span className="shint">整理接入的文件 · SQLite 落库</span>
        </button>
        <div className="secbody" style={{ display: 'block' }}>
          {loading && <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>加载中…</div>}
          {!loading && docs.length === 0 && (
            <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>
              暂无已入库文档。用上方「选择文件夹并整理」接入本地文件夹后会出现在这里。
            </div>
          )}
          {docs.map((d) => (
            <div className="kbrow" key={d.id} style={{ flexWrap: 'wrap' }}>
              <span className="pth" style={{ cursor: 'pointer' }} onClick={() => openDetail(d.id)}>
                {d.type && <span className="chip" style={{ marginRight: 6, fontSize: 10 }}>{d.type}</span>}
                <b>{d.title}</b>
                {d.tags && <span style={{ color: 'var(--mut)', marginLeft: 8 }}>#{d.tags}</span>}
              </span>
              <span className="meta">{d.file_type}</span>
              <span className="act" onClick={() => genMeta(d.id)} style={{ color: 'var(--terra)', opacity: genningId === d.id ? 0.5 : 1 }}>
                {genningId === d.id ? '生成中…' : 'AI 生成元数据'}
              </span>
              <span className="act" onClick={() => del(d.id)} style={{ color: 'var(--red)' }}>删除</span>
              {d.description && (
                <div style={{ width: '100%', fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>{d.description}</div>
              )}
            </div>
          ))}
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

      {detail && (
        <div className="modal show" onClick={() => setDetail(null)}>
          <div className="panel" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <span className="ic">📄</span>
              <h3>{detail.title}</h3>
              <button className="mclose" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="mto" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {detail.type && <span className="chip">{detail.type}</span>}
              {detail.tags && <span>#{detail.tags}</span>}
              <span className="cspacer" style={{ flex: 1 }}></span>
              <button className="anbtn" disabled={genningId === detail.id} onClick={() => genMeta(detail.id)}>
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
            <div className="mbody" style={{ whiteSpace: 'pre-wrap' }}>{detail.content_text || '（无正文）'}</div>
          </div>
        </div>
      )}
      <CrossProjectLibrary />
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'

import { api, type StagingResult } from '@/lib/api'
import FolderPicker from '@/components/FolderPicker'

import { knowledgeService as ks } from '../../services'
import { CardHead } from '../common/GlassCard'
import { GhostButton, Label, Pill } from '../common/PillButton'

/* ═══ b1 · 一键清理+入库 三步向导(海天全高抽屉) ═══
   ①仓库(repository_root_path 受管资料库根) ②选取(选桌面文件/文件夹→staging收料单)
   ③执行(五段入库流水线:落盘→解析→入库索引→归档抽图, SSE 逐文件逐段进度)。

   dev 态说明(检查点① · 无新列版):
   - 选文件夹走 FolderPicker(自绘 list-dir)降级;原生对话框+多选文件待 exe 阶段接 pywebview 桥。
   - 去重=同名同大小(_already_imported);content_hash 精确去重等 0023 迁移。
   - 进度存后端内存;"关闭重开续跑"需 0023 的 ingest_jobs 表——本版重开会重跑(去重兜底不产生重复入库)。 */

type WizStep = 1 | 2 | 3

function fmtSize(n: number) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB'
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(0) + ' KB'
  return n + ' B'
}

/* SSE 进度事件(与后端 app/ingest 的事件形态对应) */
interface IngestEvent {
  kind: string
  i?: number
  name?: string
  stage?: string
  chunks?: number
  truncated_at_page?: number
  total_pages?: number
  parse_status?: string
  reason?: string
  imported?: number
  indexed?: number
  assets?: number
  skipped?: number
  failed?: number
  total?: number
}

export function CleanupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<WizStep>(1)
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [indexedCount, setIndexedCount] = useState<number | null>(null)
  const [cfgErr, setCfgErr] = useState('')
  const [picker, setPicker] = useState<null | 'repo' | 'select'>(null)
  const [staging, setStaging] = useState<StagingResult | null>(null)
  const [pickedPaths, setPickedPaths] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  /* 执行态 */
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<IngestEvent[]>([])
  const [receipt, setReceipt] = useState<IngestEvent | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const bootedRef = useRef(false)

  /* 读受管资料库根(唯一真源:getSettings.repository_root_path) */
  const boot = useCallback(async () => {
    setErr(''); setStep(1); setStaging(null); setPickedPaths([]); setReceipt(null); setEvents([])
    try {
      const s = await api.getSettings()
      setRepoPath(s.repository_root_path || null)
      if (s.repository_root_path) {
        try { const kb = await ks.stats(); setIndexedCount(kb.documents) } catch { setIndexedCount(null) }
      }
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (open && !bootedRef.current) { bootedRef.current = true; void boot() }
    if (!open) {
      bootedRef.current = false
      esRef.current?.close()
      esRef.current = null
    }
  }, [open, boot])

  /* 关闭时清理 SSE */
  useEffect(() => () => { esRef.current?.close() }, [])

  /* 选仓库根(FolderPicker 降级;exe 走原生桥) → 写 repository_root_path */
  const onPickRepo = async (abs: string) => {
    setPicker(null); setBusy('cfg'); setCfgErr('')
    try {
      await api.listDir(abs) /* 存在性探测 */
      await api.updateSettings({ repository_root_path: abs })
      setRepoPath(abs)
      try { const kb = await ks.stats(); setIndexedCount(kb.documents) } catch { setIndexedCount(null) }
    } catch (e) {
      setCfgErr(`该路径无法作为仓库根:${(e as Error).message}`)
    } finally { setBusy('') }
  }

  /* 选取资料(文件夹) → staging 收料单 */
  const onPickSelect = async (abs: string) => {
    setPicker(null); setBusy('staging'); setErr('')
    try {
      const paths = [abs]
      const sg = await api.staging(paths)
      setStaging(sg)
      setPickedPaths(paths)
      setStep(2)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  /* 执行:启动 ingest job + 订阅 SSE 逐文件逐段进度 */
  const doIngest = async () => {
    if (pickedPaths.length === 0) return
    setBusy('ingest'); setErr(''); setEvents([]); setReceipt(null); setRunning(true); setStep(3)
    try {
      const { job_id } = await api.ingestStart(pickedPaths)
      const es = new EventSource(`/api/ingest/${job_id}/stream`)
      esRef.current = es
      /* 正常完成标志:后端发完 eof 会主动关连接,而 EventSource 规范把「服务端关连接」也当断线触发 onerror。
         无此标志时 onerror 会把「正常跑完的关闭」误报成红字(job 其实已成功)。收到 eof/gone/done 即置真。 */
      let finished = false
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data) as IngestEvent & { phase?: string }
        if (ev.kind === 'eof' || ev.kind === 'gone') {
          finished = true
          es.close(); esRef.current = null; setRunning(false); setBusy('')
          return
        }
        if (ev.kind === 'done') {
          finished = true; setReceipt(ev)
          /* hotfix1(2026-07-07):入库真完成 → 通知首页重拉真实统计(不依赖用户点「去数据基地看」)。
             根治「抽屉入库 8、首页仍 0」——首页 useKnowledgeLive 监听此事件 ver++ 重拉。 */
          window.dispatchEvent(new CustomEvent('romai:knowledge-updated'))
        }
        setEvents((prev) => [...prev, ev])
      }
      es.onerror = () => {
        es.close(); esRef.current = null; setRunning(false); setBusy('')
        /* 已正常完成(收到 eof/done)的关闭:静默,不误报。仅真·中途断线才提示。 */
        if (!finished) setErr('进度流中断(job 可能已完成,请查看数据基地最近入库)')
      }
    } catch (e) {
      setRunning(false); setBusy('')
      setErr(`启动入库失败:${(e as Error).message}`)
    }
  }

  if (!open) return null

  const stepDot = (n: WizStep, label: string) => {
    const active = step === n
    const done = step > n
    /* 回退语义(P0·入库主链路数据可信度红线):退回到「仓库」步 = 放弃本次选取,
       清 staging/pickedPaths/回执/事件——杜绝「以为选了/其实是上次的、以为入了/其实没入」。
       3→2 回看不清(仍是同一批选取,只是复核收料单)。 */
    const goBack = (target: WizStep) => {
      if (target >= step || running) return
      if (target === 1) {
        setStaging(null); setPickedPaths([]); setReceipt(null); setEvents([]); setErr('')
      }
      setStep(target)
    }
    return (
      <button
        key={n}
        className="flex items-center gap-2"
        disabled={n >= step}
        onClick={() => goBack(n)}
      >
        <span className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] ${active ? 'border-sk-primary text-sk-primary' : done ? 'border-sk-ok text-sk-ok' : 'border-sk-hair text-sk-muted2'}`}>
          {done ? '✓' : n}
        </span>
        <span className={`font-skcjk text-[12px] ${active ? 'text-sk-fg' : 'text-sk-muted2'}`}>{label}</span>
      </button>
    )
  }

  /* 进度派生:逐文件最新阶段 + 计数 */
  const fileEvents = events.filter((e) => e.kind === 'file' || e.kind === 'stage')
  const lastByFile = new Map<number, IngestEvent>()
  for (const e of fileEvents) if (e.i != null) lastByFile.set(e.i, e)
  const doneFiles = events.filter((e) => e.kind === 'file' && (e.stage === '完成' || e.stage?.includes('跳过') || e.stage === '失败'))

  return (
    <div className="absolute inset-0 z-skoverlay flex justify-end bg-[rgba(6,8,10,.5)] backdrop-blur-[4px]" onClick={(e) => { if (e.target === e.currentTarget && !running) onClose() }}>
      <div className="sk-scroll flex h-full w-[min(560px,94vw)] flex-col overflow-y-auto border-l-[0.5px] border-sk-border bg-[rgba(10,12,14,.97)] shadow-skpop">
        {/* 顶部:标题 + 步骤条 */}
        <div className="flex-none border-b-[0.5px] border-sk-hairsoft px-6 pb-3 pt-5">
          <CardHead title="一键清理 · 工作目录" en="Cleanup & Intake" right={<GhostButton className="px-3 py-1" onClick={onClose}>关闭</GhostButton>} />
          <div className="mt-3 flex items-center gap-5">
            {stepDot(1, '仓库')}
            <span className="h-px w-6 bg-sk-hairsoft" />
            {stepDot(2, '选取')}
            <span className="h-px w-6 bg-sk-hairsoft" />
            {stepDot(3, '执行')}
          </div>
        </div>

        <div className="flex-1 px-6 py-5">
          {/* ── 第一步:仓库(受管资料库根 repository_root_path) ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {repoPath ? (
                <div className="rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-4">
                  <div className="flex items-center gap-2"><Pill tone="ok">已配置</Pill><span className="font-skcjk text-[12px] text-sk-muted2">受管资料库根</span></div>
                  <div className="mt-2 break-all font-skmono text-[12.5px] text-sk-fg">{repoPath}</div>
                  {indexedCount != null && <div className="mt-1 font-skcjk text-[11.5px] text-sk-muted">知识库已索引 {indexedCount} 篇</div>}
                  <div className="mt-3 flex items-center gap-3">
                    <GhostButton onClick={() => setPicker('repo')}>更换仓库 →</GhostButton>
                    <GhostButton pri onClick={() => setPicker('select')}>下一步:选取资料 →</GhostButton>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Label>选择受管资料库根(资料复制入库的根目录)</Label>
                  <div className="font-skcjk text-[11.5px] font-light leading-[1.8] text-sk-muted">
                    选一个<b className="text-sk-fg">已存在</b>的文件夹作为资料库根;整理入库的文件会复制到 <span className="font-skmono">{'{仓库}/{项目名}/'}</span> 下。
                  </div>
                  <div><GhostButton pri disabled={busy === 'cfg'} onClick={() => setPicker('repo')}>{busy === 'cfg' ? '校验中…' : '选择文件夹 →'}</GhostButton></div>
                  {cfgErr && <div className="font-skcjk text-[11.5px] font-light text-sk-risk">{cfgErr}</div>}
                </div>
              )}
            </div>
          )}

          {/* ── 第二步:选取(桌面文件/文件夹 → staging 收料单) ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {busy === 'staging' && <div className="py-6 text-center font-skcjk text-[12.5px] text-sk-muted2">正在扫描所选资料…</div>}
              {staging && (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {([['文件', staging.total_files], ['可入库', staging.supported_files], ['已在库', staging.already_indexed], ['不支持', staging.skipped_unsupported]] as const).map(([k, v]) => (
                      <span key={k} className="font-skcjk text-[12px] text-sk-muted"><b className="mr-1.5 font-sans text-[17px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">{v}</b>{k}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">{Object.entries(staging.type_stats || {}).slice(0, 10).map(([t, n]) => <Pill key={t}>{t} {n}</Pill>)}</div>
                  {staging.error && <div className="font-skcjk text-[11.5px] text-sk-warn">{staging.error}</div>}

                  {staging.groups.map((g) => (
                    <div key={g.source_dir} className="rounded-skcard border-[0.5px] border-sk-border">
                      <div className="flex items-center justify-between border-b-[0.5px] border-sk-hairsoft px-3 py-2">
                        <span className="min-w-0 flex-1 truncate font-skcjk text-[12.5px] text-sk-fg">{g.project_hint} <span className="text-sk-muted2">· {g.files.length} 文件</span></span>
                        {g.project_id > 0 && <Pill tone="ok">已建项目</Pill>}
                      </div>
                      <div className="max-h-[220px] overflow-y-auto sk-scroll px-1 py-1">
                        {g.files.slice(0, 40).map((f) => (
                          <div key={f.abs_path} className={`flex items-center gap-2.5 px-2 py-1.5 ${f.already_indexed ? 'opacity-40' : ''}`}>
                            <span className="min-w-0 flex-1 truncate font-skcjk text-[11.5px] text-sk-muted">{f.name}</span>
                            {f.already_indexed && <span className="flex-none font-skcjk text-[10px] text-sk-muted2">已在库</span>}
                            {!f.supported && <span className="flex-none font-skcjk text-[10px] text-sk-warn">不支持</span>}
                            <span className="flex-none font-skcjk text-[10.5px] text-sk-muted2">{fmtSize(f.size)}</span>
                          </div>
                        ))}
                        {g.files.length > 40 && <div className="px-2 py-1 font-skcjk text-[10.5px] text-sk-muted2">…另 {g.files.length - 40} 项(执行时一并处理)</div>}
                      </div>
                    </div>
                  ))}
                  <div><GhostButton onClick={() => setPicker('select')}>重新选取</GhostButton></div>
                </>
              )}
            </div>
          )}

          {/* ── 第三步:执行(五段入库流水线 + SSE 进度) ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              {!running && !receipt && (
                <>
                  <div className="rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-4">
                    <div className="font-skcjk text-[13px] text-sk-fg">将入库 <b className="text-sk-primary">{staging?.supported_files ?? 0}</b> 个可解析文件</div>
                    <div className="mt-1 break-all font-skmono text-[11px] text-sk-muted2">目标仓库:{repoPath}</div>
                    <div className="mt-2 font-skcjk text-[12px] font-medium text-sk-ok">五段:识别 → 抽取 → 切块 → 索引 → 归档</div>
                  </div>
                  <div><GhostButton pri disabled={!staging?.supported_files} onClick={() => void doIngest()}>开始入库</GhostButton></div>
                </>
              )}

              {(running || receipt) && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    {([['已入库', receipt?.imported ?? 0, 'ok'], ['已索引', receipt?.indexed ?? 0, 'ok'], ['抽图', receipt?.assets ?? 0, 'default'], ['跳过', receipt?.skipped ?? 0, 'warn'], ['失败', receipt?.failed ?? 0, 'risk']] as const).map(([k, v]) => (
                      <span key={k} className="font-skcjk text-[12px] text-sk-muted"><b className={`mr-1 font-sans text-[17px] font-medium ${v ? 'text-sk-fg' : 'text-sk-muted2'}`}>{v}</b>{k}</span>
                    ))}
                  </div>
                  {running && <div className="font-skcjk text-[12px] text-sk-primary">正在入库… 已处理 {doneFiles.length} 个</div>}
                  {receipt && <div className="font-skcjk text-[12.5px] font-medium text-sk-ok">✓ 入库完成</div>}

                  {/* 逐文件进度/回执(带 chunk 数 + 截断诚实标注) */}
                  <div className="max-h-[300px] overflow-y-auto sk-scroll rounded-skcard border-[0.5px] border-sk-border">
                    {[...lastByFile.values()].slice(-60).map((e, idx) => (
                      <div key={idx} className="flex items-center gap-2 border-b-[0.5px] border-sk-hairsoft px-3 py-1.5 last:border-0">
                        <span className="min-w-0 flex-1 truncate font-skcjk text-[11px] text-sk-muted">{e.name}</span>
                        {e.stage === '完成' && e.chunks != null && (
                          <span className="flex-none font-skcjk text-[10px] text-sk-muted2">
                            {e.chunks} 块{e.truncated_at_page ? ` · 截断@${e.truncated_at_page}/${e.total_pages}页` : ''}
                          </span>
                        )}
                        <span className={`flex-none font-skcjk text-[10.5px] ${e.stage === '失败' ? 'text-sk-risk' : e.stage === '完成' ? 'text-sk-ok' : e.stage?.includes('跳过') ? 'text-sk-muted2' : 'text-sk-primary'}`}>{e.stage}</span>
                      </div>
                    ))}
                  </div>

                  {receipt && (
                    <div className="flex items-center gap-3">
                      <button className="font-skcjk text-[11.5px] text-sk-primary" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('romai:seasky:recent-refresh')) }}>去数据基地看最近入库 →</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {err && <div className="mt-3 font-skcjk text-[12px] font-light text-sk-risk">{err}</div>}
        </div>

        {/* 底部:第二步的"下一步执行" */}
        {step === 2 && staging && (
          <div className="flex-none border-t-[0.5px] border-sk-hairsoft px-6 py-3">
            <div className="flex items-center justify-between">
              <span className="font-skcjk text-[12px] text-sk-muted">可入库 <b className="text-sk-fg">{staging.supported_files}</b> 个 · 已在库 {staging.already_indexed} 个</span>
              <GhostButton pri disabled={!staging.supported_files} onClick={() => setStep(3)}>下一步:执行 →</GhostButton>
            </div>
          </div>
        )}
      </div>

      {/* 目录选择器(dev 降级;exe 走 pywebview 原生桥) */}
      <FolderPicker
        open={picker === 'repo'}
        foldersOnly
        initialPath={repoPath ?? ''}
        onPick={(p) => void onPickRepo(p)}
        onClose={() => setPicker(null)}
      />
      <FolderPicker
        open={picker === 'select'}
        initialPath={repoPath ?? ''}
        onPick={(p) => void onPickSelect(p)}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}

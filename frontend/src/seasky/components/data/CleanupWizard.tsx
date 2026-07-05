import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CleanupPreview, WorkspaceScan } from '@/lib/api'

import { knowledgeService as ks } from '../../services'
import { CardHead } from '../common/GlassCard'
import { GhostButton, Label, Pill } from '../common/PillButton'

/* ═══ b1 · 一键清理+入库 三步向导(海天全高抽屉,ADR/工单 2026-07-06) ═══
   ①仓库 ②选取(只读) ③执行(唯一写动作,轻闸)。b1 本体零改动,关抽屉像素级一致。
   契约(见 docs/现状契约-b1清理入库.md):
   - apply 走 rel_paths 子集(部分执行)+ shutil.move 永不删除(红线安全);
   - 建仓库降级=选已有目录(后端无 mkdir 端点,不新建管线);
   - 自动入库降级=清理落 workspace_path 不进 inbox 管线→'待入库N篇'+一键入库(既有 upload+index)。 */

type WizStep = 1 | 2 | 3
type Group = 'archive' | 'ignore'

function fmtSize(n: number) {
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GB'
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MB'
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(0) + ' KB'
  return n + ' B'
}

/* preview 候选按 reason 归入建议动作组——纯前端归类,不改后端语义(后端只标可清候选) */
function groupOf(reason: string): Group {
  return /tmp|temp|cache|缓存|临时|\.log|日志/i.test(reason) ? 'ignore' : 'archive'
}

const GROUP_LABEL: Record<Group, string> = { archive: '副本 · 备份 · 旧文件', ignore: '临时 · 缓存 · 日志' }

export function CleanupWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<WizStep>(1)
  const [wsPath, setWsPath] = useState<string | null>(null)
  const [wsAccessible, setWsAccessible] = useState(false)
  const [indexedCount, setIndexedCount] = useState<number | null>(null)
  const [pathDraft, setPathDraft] = useState('')
  const [cfgErr, setCfgErr] = useState('')
  const [scan, setScan] = useState<WorkspaceScan | null>(null)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [applied, setApplied] = useState<{ moved: number; skipped: number; failed: number; timestamp: string } | null>(null)
  const [restored, setRestored] = useState<{ restored: number; total: number } | null>(null)
  const bootedRef = useRef(false)

  /* 读工作目录配置(唯一真源:workspaceStatus,不持私有副本) */
  const boot = useCallback(async () => {
    setErr(''); setStep(1); setScan(null); setPreview(null); setChecked(new Set())
    setApplied(null); setRestored(null); setConfirming(false)
    try {
      const st = await ks.workspaceStatus()
      setWsPath(st.workspace_path || null)
      setWsAccessible(st.accessible)
      if (st.workspace_path && st.accessible) {
        try { const kb = await ks.stats(); setIndexedCount(kb.documents) } catch { setIndexedCount(null) }
        void enterSelect() /* 已配置→自动落第二步 */
      }
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (open && !bootedRef.current) { bootedRef.current = true; void boot() }
    if (!open) bootedRef.current = false
  }, [open, boot])

  /* 第一步→第二步:scan(只读)+ preview(只读),默认全勾 */
  const enterSelect = useCallback(async () => {
    setBusy('scan'); setErr('')
    try {
      const sc = await ks.workspaceScan()
      setScan(sc)
      if (!sc.accessible) { setErr(sc.error || '工作目录不可访问'); setBusy(''); return }
      const p = await ks.cleanupPreview()
      setPreview(p)
      setChecked(new Set((p.candidates ?? []).map((c) => c.path))) /* 默认全选 */
      setStep(2)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }, [])

  /* 保存已选目录为工作目录(复用全局端点;前端先探存在性弥补后端零校验) */
  const setWorkspace = async () => {
    const p = pathDraft.trim()
    if (!p) return
    setBusy('cfg'); setCfgErr('')
    try {
      await ks.listDir(p) /* 存在性探测:不存在会抛,弥补 workspace/config 零校验 */
      await ks.workspaceConfig(p)
      setWsPath(p); setWsAccessible(true)
      try { const kb = await ks.stats(); setIndexedCount(kb.documents) } catch { setIndexedCount(null) }
      void enterSelect()
    } catch (e) {
      setCfgErr(`该路径无法使用:${(e as Error).message}(请选择已存在的文件夹;新建请在资源管理器完成)`)
    } finally { setBusy('') }
  }

  const changeWorkspace = () => {
    /* 回改第一步→清空第二步勾选并明示 */
    setStep(1); setScan(null); setPreview(null); setChecked(new Set()); setPathDraft(wsPath ?? '')
  }

  const groups = useMemo(() => {
    const m: Record<Group, CleanupPreview['candidates']> = { archive: [], ignore: [] }
    for (const c of preview?.candidates ?? []) (m[groupOf(c.reason)] ||= []).push(c)
    return m
  }, [preview])

  const selectedList = useMemo(() => (preview?.candidates ?? []).filter((c) => checked.has(c.path)), [preview, checked])
  const selectedSize = selectedList.reduce((n, c) => n + (c.size ?? 0), 0)

  const toggle = (path: string) => setChecked((s) => { const n = new Set(s); n.has(path) ? n.delete(path) : n.add(path); return n })
  const toggleGroup = (g: Group, on: boolean) =>
    setChecked((s) => { const n = new Set(s); for (const c of groups[g] ?? []) on ? n.add(c.path) : n.delete(c.path); return n })

  /* 第三步执行:apply 传勾选子集(rel_paths),轻闸二次确认;结果三态诚实 */
  const doApply = async () => {
    if (selectedList.length === 0) return
    setBusy('apply'); setErr('')
    try {
      const r = await ks.cleanupApply(selectedList.map((c) => c.path))
      const moved = r.moved ?? 0
      setApplied({ moved, skipped: selectedList.length - moved, failed: 0, timestamp: r.manifest?.timestamp ?? '' })
      setConfirming(false)
    } catch (e) {
      /* move 中途抛错=部分落盘(契约脆弱点),如实报失败,不伪装全成功 */
      setApplied({ moved: 0, skipped: 0, failed: selectedList.length, timestamp: '' })
      setErr(`清理中断:${(e as Error).message}(部分文件可能已移入隔离区但未记录,需在 _ROMAI_CLEANUP_QUARANTINE 人工查看)`)
    } finally { setBusy('') }
  }

  const doRestore = async () => {
    if (!applied?.timestamp) return
    setBusy('restore'); setErr('')
    try {
      const r = await ks.cleanupRestore(applied.timestamp)
      setRestored({ restored: r.restored ?? 0, total: r.total ?? 0 })
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  if (!open) return null

  const stepDot = (n: WizStep, label: string) => {
    const active = step === n
    const done = step > n
    return (
      <button
        key={n}
        className="flex items-center gap-2"
        disabled={n >= step}
        onClick={() => { if (n < step) { if (n === 1) changeWorkspace(); else setStep(n) } }}
      >
        <span className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] ${active ? 'border-sk-primary text-sk-primary' : done ? 'border-sk-ok text-sk-ok' : 'border-sk-hair text-sk-muted2'}`}>
          {done ? '✓' : n}
        </span>
        <span className={`font-skcjk text-[12px] ${active ? 'text-sk-fg' : 'text-sk-muted2'}`}>{label}</span>
      </button>
    )
  }

  return (
    <div className="absolute inset-0 z-skoverlay flex justify-end bg-[rgba(6,8,10,.5)] backdrop-blur-[4px]" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
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
          {/* ── 第一步:仓库 ── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {wsPath && wsAccessible ? (
                <div className="rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-4">
                  <div className="flex items-center gap-2"><Pill tone="ok">已配置</Pill><span className="font-skcjk text-[12px] text-sk-muted2">当前工作目录</span></div>
                  <div className="mt-2 break-all font-skmono text-[12.5px] text-sk-fg">{wsPath}</div>
                  {indexedCount != null && <div className="mt-1 font-skcjk text-[11.5px] text-sk-muted">知识库已索引 {indexedCount} 篇</div>}
                  <div className="mt-3"><GhostButton onClick={changeWorkspace}>更换仓库 →</GhostButton></div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Label>选择工作目录(清理与入库作用于此)</Label>
                  <div className="font-skcjk text-[11.5px] font-light leading-[1.8] text-sk-muted">
                    请选择一个<b className="text-sk-fg">已存在</b>的文件夹作为工作目录;需要新建请先在资源管理器创建好再选。
                  </div>
                  <input
                    className="w-full rounded-[9px] border-[0.5px] border-sk-hair bg-transparent px-3 py-2 font-skmono text-[12.5px] text-sk-fg outline-none placeholder:text-sk-muted2 focus:border-[rgba(127,179,207,.45)]"
                    placeholder="例如 D:\\设计仓库\\星河国际"
                    value={pathDraft}
                    onChange={(e) => setPathDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void setWorkspace() }}
                  />
                  {cfgErr && <div className="font-skcjk text-[11.5px] font-light text-sk-risk">{cfgErr}</div>}
                  <div><GhostButton pri disabled={busy === 'cfg'} onClick={() => void setWorkspace()}>{busy === 'cfg' ? '校验中…' : '设为工作目录 →'}</GhostButton></div>
                </div>
              )}
            </div>
          )}

          {/* ── 第二步:选取(只读) ── */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {busy === 'scan' && <div className="py-6 text-center font-skcjk text-[12.5px] text-sk-muted2">正在扫描工作目录…</div>}
              {scan && (
                <>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {([['文件', scan.total_files], ['文件夹', scan.total_dirs], ['总大小', fmtSize(scan.total_size)], ['可自动清理', scan.auto_cleanable?.length ?? 0]] as const).map(([k, v]) => (
                      <span key={k} className="font-skcjk text-[12px] text-sk-muted"><b className="mr-1.5 font-sans text-[17px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">{v}</b>{k}</span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5">{Object.entries(scan.type_stats || {}).slice(0, 8).map(([t, n]) => <Pill key={t}>{t} {n}</Pill>)}</div>

                  {(preview?.count ?? 0) === 0 ? (
                    <div className="py-3 font-skcjk text-[13px] text-sk-ok">目录很干净,没有可自动清理的项。</div>
                  ) : (
                    (['ignore', 'archive'] as Group[]).filter((g) => (groups[g]?.length ?? 0) > 0).map((g) => {
                      const list = groups[g]!
                      const allOn = list.every((c) => checked.has(c.path))
                      return (
                        <div key={g} className="rounded-skcard border-[0.5px] border-sk-border">
                          <div className="flex items-center justify-between border-b-[0.5px] border-sk-hairsoft px-3 py-2">
                            <span className="font-skcjk text-[12.5px] text-sk-fg">{GROUP_LABEL[g]} <span className="text-sk-muted2">{list.length}</span></span>
                            <button className="font-skcjk text-[11px] text-sk-primary" onClick={() => toggleGroup(g, !allOn)}>{allOn ? '取消全选' : '全选'}</button>
                          </div>
                          <div className="max-h-[180px] overflow-y-auto sk-scroll px-1 py-1">
                            {list.slice(0, 8).map((c) => (
                              <label key={c.path} className="flex cursor-pointer items-center gap-2.5 px-2 py-1.5">
                                <input type="checkbox" className="accent-sk-primary" checked={checked.has(c.path)} onChange={() => toggle(c.path)} />
                                <span className="min-w-0 flex-1 truncate font-skcjk text-[11.5px] text-sk-muted">{c.path}</span>
                                <span className="flex-none font-skcjk text-[10.5px] text-sk-muted2">{fmtSize(c.size)}</span>
                              </label>
                            ))}
                            {list.length > 8 && <div className="px-2 py-1 font-skcjk text-[10.5px] text-sk-muted2">…另 {list.length - 8} 项同规则(执行时一并处理已勾选项)</div>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 第三步:执行(唯一写动作) ── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              {!applied ? (
                <>
                  <div className="rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-4">
                    <div className="font-skcjk text-[13px] text-sk-fg">将清理 <b className="text-sk-primary">{selectedList.length}</b> 项 · 合计 {fmtSize(selectedSize)}</div>
                    <div className="mt-1 break-all font-skmono text-[11px] text-sk-muted2">目标仓库:{wsPath}</div>
                    <div className="mt-2 font-skcjk text-[12px] font-medium text-sk-ok">✓ 只移入隔离区 · 永不删除(随时可撤销)</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!confirming ? (
                      <GhostButton pri disabled={selectedList.length === 0} onClick={() => setConfirming(true)}>清理 {selectedList.length} 项</GhostButton>
                    ) : (
                      <>
                        <GhostButton pri disabled={busy === 'apply'} onClick={() => void doApply()}>{busy === 'apply' ? '移入中…' : `确认清理 ${selectedList.length} 项`}</GhostButton>
                        <GhostButton disabled={busy === 'apply'} onClick={() => setConfirming(false)}>取消</GhostButton>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <span className="font-skcjk text-[12px] text-sk-muted"><b className="mr-1 font-sans text-[17px] font-medium text-sk-ok">{applied.moved}</b>已移入</span>
                    {applied.skipped > 0 && <span className="font-skcjk text-[12px] text-sk-muted"><b className="mr-1 font-sans text-[17px] font-medium text-sk-warn">{applied.skipped}</b>跳过</span>}
                    {applied.failed > 0 && <span className="font-skcjk text-[12px] text-sk-muted"><b className="mr-1 font-sans text-[17px] font-medium text-sk-risk">{applied.failed}</b>失败</span>}
                  </div>
                  {/* 自动入库降级(契约):清理落 workspace_path 不进 inbox 管线,且入库须浏览器选文件/收件箱扫描——
                      wizard 内无法一键真入库,如实深链到数据基地入库入口,不做假一键 */}
                  {applied.moved > 0 && (
                    <div className="rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-3">
                      <div className="font-skcjk text-[12.5px] text-sk-muted">清理完成。留在工作目录的资料<b className="text-sk-fg">待入库</b>——清理与入库是两条独立管线,入库请在数据基地完成(收件箱扫描 / 上传索引)。</div>
                      <div className="mt-2"><GhostButton onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('romai:seasky:recent-refresh')) }}>去数据基地入库 →</GhostButton></div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {restored ? (
                      <div className="font-skcjk text-[12.5px] text-sk-primary">已撤销恢复 {restored.restored}/{restored.total} 项回原位。</div>
                    ) : applied.moved > 0 ? (
                      <GhostButton disabled={busy === 'restore'} onClick={() => void doRestore()}>{busy === 'restore' ? '恢复中…' : '↩ 一键撤销'}</GhostButton>
                    ) : null}
                    <button className="font-skcjk text-[11.5px] text-sk-primary" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('romai:seasky:recent-refresh')) }}>查看最近入库 →</button>
                  </div>
                  <div className="font-skcjk text-[10.5px] font-light text-sk-muted2">撤销仅本次会话有效;隔离区文件长期保留在 _ROMAI_CLEANUP_QUARANTINE/</div>
                </div>
              )}
            </div>
          )}

          {err && <div className="mt-3 font-skcjk text-[12px] font-light text-sk-risk">{err}</div>}
        </div>

        {/* 底部:计数条 + 步进(第二步常驻) */}
        {step === 2 && (
          <div className="flex-none border-t-[0.5px] border-sk-hairsoft px-6 py-3">
            <div className="flex items-center justify-between">
              <span className="font-skcjk text-[12px] text-sk-muted">已选 <b className="text-sk-fg">{selectedList.length}</b> 项 · 共 {fmtSize(selectedSize)}</span>
              <GhostButton pri disabled={selectedList.length === 0} onClick={() => setStep(3)}>下一步:执行 →</GhostButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

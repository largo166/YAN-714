import { useEffect, useRef, useState } from 'react'

import { AlertTriangle, Calendar, FileAudio, FileText, ListChecks, RefreshCw } from 'lucide-react'

import { api } from '@/lib/api'
import { CountNum, useCountUp } from '@/lib/useCountUp'
import { useProject } from '@/contexts/useProject'
import type {
  ProjectMilestone,
  ProjectOverview,
  ProjectProgress,
  ProjectRisk,
  ReusableAsset,
} from '@/types/schemas'

import ProjectAnalysisPanel from './ProjectAnalysisPanel'
import ProjectFilesPanel from './ProjectFilesPanel'
import CognitionSection from './CognitionSection'
import StageProgressPanel from './StageProgressPanel'
import MeetingPanel from './MeetingPanel'
import TaskBoardPanel from './TaskBoardPanel'
import TencentMeetingCard from './TencentMeetingCard'
import WorkspacePanel from './WorkspacePanel'

const STAGE_CHIP: Record<string, string> = {
  active: '进行中',
  planning: '方案阶段',
  completed: '已完成',
}

// 拖拽进项目中心可接入的可解析扩展(与营地/数据基地一致)
const DROP_EXTS = ['.txt', '.md', '.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg']

// DC 暗色基元（与 BossPage/CampPage/HubPage 同一套色板，跨页一致）
const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d', green: '#49d18d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674', line: 'rgba(255,255,255,.08)',
  glass: 'linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))',
}
const cardBase: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 18, background: C.glass }

/** 驾驶舱 KPI 卡（.ckcard：顶边光条 + 发光角 + hover）。ac=顶条色 gl=角辉光。值 '—' 不伪造。 */
function Kpi({ icon, label, value, color, ac, gl }: { icon: React.ReactNode; label: string; value: React.ReactNode; color?: string; ac: string; gl: string }) {
  return (
    <div className="ckcard" style={{ padding: '14px 15px', minHeight: 84, ['--ac']: ac, ['--gl']: gl } as React.CSSProperties}>
      <div style={{ color: C.mut, fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}><span>{icon}</span>{label}</div>
      <div style={{ marginTop: 9, fontSize: 27, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: color || C.ink }}>{value}</div>
    </div>
  )
}

/** 阶段进度环形仪表（pct 真实，发光 conic 环 + 充能动画 + 中心数字滚动）。 */
function Gauge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  const shown = useCountUp(p, 900)
  return (
    <div className="gauge-anim" style={{ width: 156, height: 156, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, ['--gp']: `${p}%`, background: 'conic-gradient(#7c5cff 0% var(--gp), rgba(255,255,255,.06) var(--gp) 100%)', boxShadow: '0 0 44px rgba(124,92,255,.26)' } as React.CSSProperties}>
      <div style={{ width: 118, height: 118, borderRadius: '50%', background: '#0a0c12', display: 'grid', placeItems: 'center', textAlign: 'center', border: `1px solid ${C.line}` }}>
        <div>
          <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{shown}<span style={{ fontSize: 14, color: C.mut }}>%</span></div>
          <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>阶段进度</div>
        </div>
      </div>
    </div>
  )
}

/** 分组标题（核心 / 判断解析 / 资料）——竖条 + 标题 + 渐隐分隔线。可带 id 作跳转锚点。 */
function GroupLabel({ children, hint, id }: { children: React.ReactNode; hint?: string; id?: string }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px', scrollMarginTop: 14 }}>
      <span style={{ width: 4, height: 16, borderRadius: 2, background: 'linear-gradient(180deg,#7c5cff,#42a5ff)', flexShrink: 0 }} />
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-.02em', flexShrink: 0 }}>{children}</h2>
      {hint && <span style={{ fontSize: 11.5, color: C.mut }}>{hint}</span>}
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${C.line},transparent)` }} />
    </div>
  )
}

/** 可折叠分区外壳(复用 .sec/data-open 折叠骨架)。可带 id 作跳转锚点。纯包裹，不改内部功能。 */
function Collapsible({
  open,
  onToggle,
  title,
  count,
  hint,
  id,
  children,
}: {
  open: boolean
  onToggle: () => void
  title: string
  count?: string
  hint?: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section className="sec" data-open={open ? '1' : '0'} id={id} style={{ scrollMarginTop: 14 }}>
      <button className="sechead" type="button" onClick={onToggle}>
        <span className="chev">▸</span>
        <span className="stitle">{title}</span>
        {count && <span className="scount">{count}</span>}
        {hint && <span className="shint">{hint}</span>}
      </button>
      <div className="secbody">{children}</div>
    </section>
  )
}

/** 项目中心：单项目工作台（v2 版面：脉搏卡 + 本周聚焦卡 双 HERO + KPI 指标带 + 快速跳转 + 主/侧两栏 + 资料降权）。
 *  核心 = 前期判断解析 + 会议链路；资料读取/清理归数据基地（此处降权收底）。
 *  数据全接真实后端，逻辑不动；聚焦/迷你统计全部派生自已取的真实数据，不新增后端、不伪造。 */
export default function ProjectCenterPage() {
  const { projects, curId, setCurId, cur, err, reload } = useProject()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const [renameErr, setRenameErr] = useState<string | null>(null)
  // 折叠状态；核心块默认展开，资料块（files/workspace 未列）默认折叠。
  const [open, setOpen] = useState<Record<string, boolean>>({
    tencent: true, meeting: true, tasks: true, stage: true, cognition: true, analysis: true,
  })
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  // 跳转锚点：展开目标块（如需）后平滑滚动到位
  const jump = (anchorId: string, openKey?: string) => {
    if (openKey) setOpen((o) => ({ ...o, [openKey]: true }))
    setTimeout(() => document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  const doRename = async () => {
    if (curId == null || !renameVal.trim()) return
    setRenameErr(null)
    try {
      await api.updateProject(curId, { name: renameVal.trim() })
      reload()
      setRenaming(false)
    } catch (e) {
      setRenameErr((e as Error).message)
    }
  }
  const [overview, setOverview] = useState<ProjectOverview | null>(null)
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [risks, setRisks] = useState<ProjectRisk[]>([])
  const [reuseTags, setReuseTags] = useState<ReusableAsset[]>([])
  const [progress, setProgress] = useState<ProjectProgress | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [taskRisk, setTaskRisk] = useState<{ overdue: number; stale: number }>({ overdue: 0, stale: 0 })
  // 拖拽接入：把文件拖进项目中心 → 上传到当前项目(建索引+抽图)→ 成为该项目材料,刷新概览
  const dragDepth = useRef(0)
  const [drag, setDrag] = useState(false)
  const [dropMsg, setDropMsg] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  useEffect(() => {
    if (curId == null) {
      setOverview(null)
      setMilestones([])
      setRisks([])
      setReuseTags([])
      setProgress(null)
      return
    }
    let alive = true
    setOverview(null)
    setMilestones([])
    setRisks([])
    setReuseTags([])
    setProgress(null)
    api.getProjectOverview(curId).then((d) => alive && setOverview(d)).catch(() => {})
    api.getProjectMilestones(curId).then((d) => alive && setMilestones(d)).catch(() => {})
    api.getProjectRisks(curId).then((d) => alive && setRisks(d)).catch(() => {})
    api.getProjectReusableAssets(curId).then((d) => alive && setReuseTags(d)).catch(() => {})
    api.getProjectProgress(curId).then((d) => alive && setProgress(d)).catch(() => {})
    return () => {
      alive = false
    }
  }, [curId, refreshKey])

  const nextNode = progress?.next_node ? `下一节点 · ${progress.next_node}${progress.next_due ? ' · ' + progress.next_due : ''}` : '生成并确认会议纪要后，下一节点会出现在这里'

  // 本周聚焦：实时聚合「需负责人介入」（全部来自已取真实数据，不伪造）
  const highRisks = risks.filter((r) => r.level === 'high')
  const urgentMs = milestones.filter((m) => m.urgent)
  const taskBad = taskRisk.overdue + taskRisk.stale
  const focusItems = [
    highRisks.length > 0 && { dot: C.red, label: `高风险${highRisks[0] ? ' · ' + highRisks[0].text : ''}`, n: String(highRisks.length), go: '查看', onClick: () => jump('side-risks') },
    urgentMs.length > 0 && { dot: C.gold, label: `紧急里程碑${urgentMs[0] ? ' · ' + urgentMs[0].title : ''}`, n: String(urgentMs.length), go: '里程碑', onClick: () => jump('side-milestones') },
    taskBad > 0 && { dot: C.amber, label: '过期 / 卡住任务', n: `${taskRisk.overdue} / ${taskRisk.stale}`, go: '任务看板', onClick: () => jump('sec-tasks', 'tasks') },
  ].filter(Boolean) as { dot: string; label: string; n: string; go: string; onClick: () => void }[]

  const mini = (n: React.ReactNode, label: string, color?: string) => (
    <div><div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: color || C.ink }}>{n}</div><div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>{label}</div></div>
  )
  const jumpChip = (label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick} style={{ fontFamily: 'inherit', cursor: 'pointer', fontSize: 12, color: C.ink2, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,.04)', borderRadius: 99, padding: '5px 12px' }}>{label}</button>
  )

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDrag(false)
    const all = Array.from(e.dataTransfer?.files || [])
    if (all.length === 0) return
    const files = all.filter((f) => DROP_EXTS.some((x) => f.name.toLowerCase().endsWith(x)))
    if (files.length === 0) { setDropMsg('没有可接入的文件（支持 txt/md/pdf/docx/pptx/xlsx/图片）。'); return }
    if (curId == null || !cur) { setDropMsg('请先在上方选择 / 新建项目，再把文件拖进来。'); return }
    setDropping(true)
    setDropMsg(`正在接入 ${files.length} 个文件到「${cur.name}」…`)
    let ok = 0, fail = 0
    const ids: number[] = []
    for (const f of files) {
      try {
        const pf = await api.uploadProjectFile(curId, f)
        ids.push(pf.id)
        try { await api.indexProjectFile(curId, pf.id) } catch { /* 索引失败不致命 */ }
        ok++
      } catch { fail++ }
    }
    void Promise.all(ids.map((id) => api.extractFileAssets(curId, id).catch(() => null)))
    setDropping(false)
    setRefreshKey((k) => k + 1)
    setDropMsg(`已接入 ${ok} 个文件到「${cur.name}」${fail ? `，失败 ${fail}` : ''} —— 概览已更新，可在「资料」看到。`)
    setTimeout(() => setDropMsg(null), 6000)
  }

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDrag(true) }}
      onDragOver={(e) => { e.preventDefault() }}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDrag(false) }}
      onDrop={onDrop}
      style={{ color: C.ink, fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif", letterSpacing: '-.01em' }}>
      {drag && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,10,16,.7)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ border: `2px dashed ${C.purple}`, borderRadius: 24, padding: '40px 64px', background: 'rgba(124,92,255,.08)', color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', boxShadow: '0 0 60px rgba(124,92,255,.4)' }}>
            ⬇ 松手接入到{cur ? `「${cur.name}」` : '项目'}
            <div style={{ fontSize: 12, fontWeight: 400, color: C.ink2, marginTop: 8 }}>{cur ? 'txt/md/pdf/docx/pptx/xlsx/图片 → 成为该项目材料' : '请先在上方选择 / 新建项目'}</div>
          </div>
        </div>
      )}
      {dropMsg && (
        <div style={{ position: 'fixed', left: '50%', bottom: 30, transform: 'translateX(-50%)', zIndex: 90, background: '#171a24', border: `1px solid ${C.line}`, borderRadius: 12, padding: '10px 16px', color: C.ink2, fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'min(560px,92vw)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dropping ? C.amber : C.cyan, boxShadow: `0 0 8px ${dropping ? C.amber : C.cyan}` }} />
          <span style={{ flex: 1 }}>{dropMsg}</span>
          {!dropping && <button type="button" onClick={() => setDropMsg(null)} style={{ background: 'transparent', border: 0, color: C.mut, cursor: 'pointer', fontSize: 14 }}>✕</button>}
        </div>
      )}
      {/* HEADER：项目下拉 / 改名 / chip */}
      <div className="ptitle">
        <h1 style={{ background: 'linear-gradient(95deg,#fff,#c8bcff 55%,#80c9ff)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>项目中心</h1>
        <div className="projsel">
          <div className="pick" onClick={() => setMenuOpen((v) => !v)}>
            ▾ 当前项目 · <b>{cur?.name ?? '（暂无项目）'}</b>
          </div>
          <div className={'projmenu' + (menuOpen ? ' show' : '')}>
            {projects.map((p) => (
              <button
                key={p.id}
                className={'projitem' + (p.id === curId ? ' on' : '')}
                onClick={() => { setCurId(p.id); setMenuOpen(false) }}
              >
                <div>
                  <div className="pi-name">{p.name}</div>
                  <div className="pi-meta">{p.description || '—'}</div>
                </div>
                <span className="pi-stage">{STAGE_CHIP[p.status] ?? p.status}</span>
              </button>
            ))}
            {projects.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--mut)' }}>暂无项目，可在「新建项目」接口创建</div>
            )}
          </div>
        </div>
        {cur && !renaming && (
          <span className="act" style={{ marginLeft: 6, color: C.purple, cursor: 'pointer', fontSize: 12 }} title="重命名当前项目" onClick={() => { setRenameVal(cur.name); setRenaming(true) }}>✎ 改名</span>
        )}
        {cur && renaming && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
            <input value={renameVal} autoFocus onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(false) }} style={{ fontSize: 13, padding: '2px 6px', border: `1px solid ${C.line}`, borderRadius: 6, background: 'rgba(255,255,255,.045)', color: C.ink }} />
            <button className="anbtn" disabled={!renameVal.trim()} onClick={doRename}>存</button>
            <button className="anbtn" onClick={() => setRenaming(false)}>取消</button>
            {renameErr && <span style={{ fontSize: 11, color: C.red }}>{renameErr}</span>}
          </span>
        )}
        <div style={{ display: 'flex', gap: 5, marginLeft: 6 }}>
          {cur?.city && <span className="chip">{cur.city}</span>}
          {cur && <span className="chip on">{STAGE_CHIP[cur.status] ?? cur.status}</span>}
          {cur?.client && <span className="chip">甲方 · {cur.client}</span>}
        </div>
      </div>

      {err && <div style={{ ...cardBase, padding: 16, marginBottom: 16, color: C.red }}>项目数据加载失败：{err}</div>}

      {/* HERO：项目脉搏卡（环形仪表 + 阶段 + 下一节点 + 迷你统计）+ 本周聚焦卡（真实聚合，可点跳转） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr)', gap: 16, marginBottom: 14 }}>
        <div className="ckcard" style={{ padding: 20, display: 'grid', gridTemplateColumns: '156px 1fr', gap: 18, alignItems: 'center', ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.26)' } as React.CSSProperties}>
          <Gauge pct={progress?.pct ?? 0} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{cur ? (STAGE_CHIP[cur.status] ?? cur.status) : '—'}</div>
            <div style={{ fontSize: 12, color: C.gold, marginTop: 6, lineHeight: 1.5 }}>{nextNode}</div>
            <div style={{ display: 'flex', gap: 18, marginTop: 16, flexWrap: 'wrap' }}>
              {mini(overview ? <CountNum n={overview.files} /> : '—', '文件')}
              {mini(overview ? <CountNum n={overview.meetings} /> : '—', '会议')}
              {mini(overview ? <CountNum n={overview.minutes} /> : '—', '会议纪要')}
            </div>
          </div>
        </div>
        <div className="ckcard" style={{ padding: 18, ['--ac']: '#ff5e66', ['--gl']: 'rgba(255,94,102,.26)' } as React.CSSProperties}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>本周聚焦 <span style={{ fontSize: 11, color: C.mut, fontWeight: 400 }}>需负责人介入（实时聚合）</span></div>
          {focusItems.length === 0 ? (
            <div style={{ color: C.mut, fontSize: 12.5, padding: '12px 0' }}>暂无需要立即介入的事。出现高风险 / 紧急里程碑 / 过期任务时在此聚合。</div>
          ) : (
            focusItems.map((f, i) => (
              <button key={i} type="button" onClick={f.onClick} style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: 0, borderTop: i === 0 ? 0 : `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', color: C.ink2 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: f.dot, boxShadow: `0 0 8px ${f.dot}` }} />
                <span style={{ flex: 1, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: f.dot }}>{f.n}</span>
                <span style={{ fontSize: 11, color: C.mut, whiteSpace: 'nowrap' }}>{f.go} ›</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* KPI 指标带（真实数据，去掉后端恒 0 的「成果缺口」） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 14 }}>
        <Kpi icon={<FileText size={13} />} label="文件" value={overview ? <CountNum n={overview.files} /> : '—'} ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.3)" />
        <Kpi icon={<Calendar size={13} />} label="会议" value={overview ? <CountNum n={overview.meetings} /> : '—'} ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.24)" />
        <Kpi icon={<ListChecks size={13} />} label="待办" value={overview ? <CountNum n={overview.todos} /> : '—'} color={C.amber} ac="#fdab3d" gl="rgba(215,168,110,.26)" />
        <Kpi icon={<FileAudio size={13} />} label="会议纪要" value={overview ? <CountNum n={overview.minutes} /> : '—'} ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.24)" />
        <Kpi icon={<AlertTriangle size={13} />} label="风险" value={overview ? <CountNum n={overview.risks} /> : '—'} color={C.red} ac="#ff5e66" gl="rgba(255,94,102,.26)" />
        <Kpi icon={<RefreshCw size={13} />} label="可复用资产" value={overview ? <CountNum n={overview.assets} /> : '—'} ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.22)" />
      </div>

      {/* 快速跳转 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11.5, color: C.mut }}>快速跳转：</span>
        {jumpChip('会议链路', () => jump('grp-meeting'))}
        {jumpChip('任务看板', () => jump('sec-tasks', 'tasks'))}
        {jumpChip('项目解读', () => jump('sec-cognition', 'cognition'))}
        {jumpChip('智能研判', () => jump('sec-analysis', 'analysis'))}
      </div>

      {/* 主（核心：会议链路 + 判断解析）+ 侧（状态：里程碑/风险/资产）两栏 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start', marginTop: 4 }}>
        <main style={{ minWidth: 0 }}>
          <GroupLabel id="grp-meeting" hint="腾讯会议 → 会议纪要 → 任务看板">会议链路</GroupLabel>
          <Collapsible open={!!open.tencent} onToggle={() => toggle('tencent')} title="腾讯会议" hint="一键创建真实会议">
            <TencentMeetingCard projectId={curId} />
          </Collapsible>
          <Collapsible open={!!open.meeting} onToggle={() => toggle('meeting')} title="会议纪要" hint="创建会议 / 上传材料 / 纪要回流">
            <MeetingPanel projectId={curId} onReflowed={() => setRefreshKey((k) => k + 1)} onConfirmed={() => setRefreshKey((k) => k + 1)} />
          </Collapsible>
          <Collapsible open={!!open.tasks} onToggle={() => toggle('tasks')} id="sec-tasks" title="任务看板"
            count={taskBad > 0 ? `⚠ ${taskBad}` : undefined}
            hint={taskBad > 0 ? `${taskRisk.overdue} 过期 · ${taskRisk.stale} 卡住` : '会议纪要待办 → 待办 / 进行中 / 已完成'}>
            <TaskBoardPanel projectId={curId} onRisk={setTaskRisk} refreshSignal={refreshKey} />
          </Collapsible>

          <GroupLabel id="grp-judge" hint="任务书 / 场地 / 概念 … AI 解读 + 研判">判断解析</GroupLabel>
          <Collapsible open={!!open.cognition} onToggle={() => toggle('cognition')} id="sec-cognition" title="项目解读" hint="任务书 / 场地 / 概念 … 一键 AI 解读">
            <CognitionSection projectId={curId} />
          </Collapsible>
          <Collapsible open={!!open.analysis} onToggle={() => toggle('analysis')} id="sec-analysis" title="智能研判"
            count="前期分析 · 5 项" hint="总览 / 难点 / 诉求 / 推进计划 / 汇报提纲">
            <ProjectAnalysisPanel projectId={curId} />
          </Collapsible>
          <Collapsible open={!!open.stage} onToggle={() => toggle('stage')} title="阶段拆解">
            <StageProgressPanel projectId={curId} />
          </Collapsible>
        </main>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 14 }}>
          <div id="side-milestones" style={{ ...cardBase, padding: 16, scrollMarginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>下一步 · 里程碑</div>
            {milestones.length === 0 ? (
              <div style={{ color: C.mut, fontSize: 12.5, padding: '6px 0' }}>暂无里程碑。接入项目任务后在此显示（负责人 · 截止）。</div>
            ) : (
              milestones.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, color: C.ink2, padding: '6px 0' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: m.urgent ? C.red : C.gold, boxShadow: `0 0 8px ${m.urgent ? C.red : C.gold}`, transform: 'translateY(-1px)' }} />
                  <span style={{ flex: 1 }}>{m.title}</span>
                  <span style={{ fontSize: 11, color: C.mut, whiteSpace: 'nowrap' }}>{m.owner} · {m.due}</span>
                </div>
              ))
            )}
          </div>
          <div id="side-risks" style={{ ...cardBase, padding: 16, scrollMarginTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 10 }}>风险看板 · 可复用资产</div>
            {risks.length === 0 ? (
              <div style={{ color: C.mut, fontSize: 12.5, padding: '6px 0' }}>暂无风险项。接入 AI 研判风险后在此显示。</div>
            ) : (
              risks.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, color: C.ink2, padding: '6px 0' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '1px 7px', flexShrink: 0, color: r.level === 'high' ? '#ff9b9b' : '#e2c07a', border: `1px solid ${r.level === 'high' ? 'rgba(255,94,102,.4)' : 'rgba(215,168,110,.4)'}`, background: r.level === 'high' ? 'rgba(255,94,102,.12)' : 'rgba(215,168,110,.12)' }}>{r.level === 'high' ? '高' : '中'}</span>
                  <span style={{ flex: 1 }}>{r.text}</span>
                </div>
              ))
            )}
            {reuseTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                {reuseTags.map((t, i) => (
                  <span key={i} style={{ fontSize: 11, color: C.ink2, border: `1px solid ${C.line}`, borderRadius: 7, padding: '2px 8px' }}><span style={{ color: C.mut, marginRight: 4 }}>{t.kind}</span>{t.name}</span>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 资料区降权（职能区分：读取/清理归数据基地，此处默认折叠、低权重，不删） */}
      <GroupLabel hint="读取 / 清理归数据基地 · 此处仅本项目入口">资料</GroupLabel>
      <Collapsible open={!!open.files} onToggle={() => toggle('files')} title="项目文件" hint="拖拽 / 选择上传 · txt/md/pdf/docx/pptx">
        <ProjectFilesPanel projectId={curId} />
      </Collapsible>
      <Collapsible open={!!open.workspace} onToggle={() => toggle('workspace')} title="项目目录 · 读取与安全清理">
        <WorkspacePanel />
      </Collapsible>
    </div>
  )
}

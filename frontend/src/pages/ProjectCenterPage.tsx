import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
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

// DC 暗色基元（与 BossPage/CampPage/HubPage 同一套色板，跨页一致）
const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d', green: '#49d18d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674', line: 'rgba(255,255,255,.08)',
  glass: 'linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))',
}
const cardBase: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 18, background: C.glass }

/** 驾驶舱 KPI 卡（.ckcard：顶边光条 + 发光角 + hover）。ac=顶条色 gl=角辉光。值 '—' 不伪造。 */
function Kpi({ icon, label, value, color, ac, gl }: { icon: string; label: string; value: React.ReactNode; color?: string; ac: string; gl: string }) {
  return (
    <div className="ckcard" style={{ padding: '15px 16px', minHeight: 92, ['--ac']: ac, ['--gl']: gl } as React.CSSProperties}>
      <div style={{ color: C.mut, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><span>{icon}</span>{label}</div>
      <div style={{ marginTop: 12, fontSize: 30, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: color || C.ink }}>{value}</div>
    </div>
  )
}

/** 阶段进度环形仪表（pct 真实，发光 conic 环 + 中心大号 %）。 */
function Gauge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div style={{ width: 168, height: 168, borderRadius: '50%', display: 'grid', placeItems: 'center', background: `conic-gradient(#7c5cff 0% ${p}%, rgba(255,255,255,.06) ${p}% 100%)`, boxShadow: '0 0 46px rgba(124,92,255,.26)' }}>
      <div style={{ width: 126, height: 126, borderRadius: '50%', background: '#0a0c12', display: 'grid', placeItems: 'center', textAlign: 'center', border: `1px solid ${C.line}` }}>
        <div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{p}<span style={{ fontSize: 15, color: C.mut }}>%</span></div>
          <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>阶段进度</div>
        </div>
      </div>
    </div>
  )
}

/** 分组标题（核心 / 判断解析 / 资料）——竖条 + 标题 + 渐隐分隔线。 */
function GroupLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px' }}>
      <span style={{ width: 4, height: 16, borderRadius: 2, background: 'linear-gradient(180deg,#7c5cff,#42a5ff)', flexShrink: 0 }} />
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-.02em', flexShrink: 0 }}>{children}</h2>
      {hint && <span style={{ fontSize: 11.5, color: C.mut }}>{hint}</span>}
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${C.line},transparent)` }} />
    </div>
  )
}

/** 可折叠分区外壳(复用 .sec/data-open 折叠骨架)：点标题展开/收起。纯包裹，不改内部功能。 */
function Collapsible({
  open,
  onToggle,
  title,
  count,
  hint,
  children,
}: {
  open: boolean
  onToggle: () => void
  title: string
  count?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="sec" data-open={open ? '1' : '0'}>
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

/** 项目中心：单项目工作台（借 DC 版面：概览 KPI 卡 + 主/侧两栏 + 资料降权）。
 *  核心 = 前期判断解析 + 会议链路；资料读取/清理归数据基地（此处降权收底）。
 *  数据全接真实后端，逻辑不动；当前项目走共享上下文（useProject）。 */
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

  const doRename = async () => {
    if (curId == null || !renameVal.trim()) return
    setRenameErr(null)
    try {
      await api.updateProject(curId, { name: renameVal.trim() })
      reload() // 刷新共享上下文 → 下拉/标题随即显示新名
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
  // 会议纪要「回流」或「确认」后 +1：触发 KPI/里程碑/进度重取，并驱动任务看板重拉
  const [refreshKey, setRefreshKey] = useState(0)
  // 任务看板风险计数（过期/卡住）——折叠时也在 section hint 上显示徽章
  const [taskRisk, setTaskRisk] = useState<{ overdue: number; stale: number }>({ overdue: 0, stale: 0 })

  // 切项目时拉取 KPI 真实计数（只读聚合）。curId 变化即重取，加载中暂显 —。
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

  const taskCount = taskRisk.overdue + taskRisk.stale

  return (
    <div style={{ color: C.ink, fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif", letterSpacing: '-.01em' }}>
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

      {/* HERO：阶段进度环形仪表(左) + 概览 KPI 簇(右)，主次错落（去掉后端恒 0 的「成果缺口」）。 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,280px) minmax(0,1fr)', gap: 16, alignItems: 'stretch' }}>
        <div className="ckcard" style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.28)' } as React.CSSProperties}>
          <Gauge pct={progress?.pct ?? 0} />
          <div style={{ fontSize: 12, color: C.gold, textAlign: 'center', lineHeight: 1.5 }}>
            {progress?.next_node ? `下一节点 · ${progress.next_node}${progress.next_due ? ' · ' + progress.next_due : ''}` : '下一节点 · 待接入项目里程碑'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
          <Kpi icon="📄" label="文件" value={overview ? overview.files : '—'} ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.3)" />
          <Kpi icon="📅" label="会议" value={overview ? overview.meetings : '—'} ac="#42a5ff" gl="rgba(66,165,255,.26)" />
          <Kpi icon="✓" label="待办" value={overview ? overview.todos : '—'} color={C.amber} ac="#fdab3d" gl="rgba(215,168,110,.26)" />
          <Kpi icon="🔊" label="会议纪要" value={overview ? overview.minutes : '—'} color={C.cyan} ac="#36e6d4" gl="rgba(54,230,212,.24)" />
          <Kpi icon="⚠" label="风险" value={overview ? overview.risks : '—'} color={C.red} ac="#ff5e66" gl="rgba(255,94,102,.26)" />
          <Kpi icon="⟳" label="可复用资产" value={overview ? overview.assets : '—'} ac="linear-gradient(90deg,#7c5cff,#36e6d4)" gl="rgba(124,92,255,.22)" />
        </div>
      </div>

      {/* 主（核心：会议链路 + 判断解析）+ 侧（状态：里程碑/风险/资产）两栏 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start', marginTop: 4 }}>
        <main style={{ minWidth: 0 }}>
          <GroupLabel hint="腾讯会议 → 会议纪要 → 任务看板">会议链路</GroupLabel>
          <Collapsible open={!!open.tencent} onToggle={() => toggle('tencent')} title="腾讯会议" hint="一键创建真实会议">
            <TencentMeetingCard projectId={curId} />
          </Collapsible>
          <Collapsible open={!!open.meeting} onToggle={() => toggle('meeting')} title="会议纪要" hint="创建会议 / 上传材料 / 纪要回流">
            <MeetingPanel projectId={curId} onReflowed={() => setRefreshKey((k) => k + 1)} onConfirmed={() => setRefreshKey((k) => k + 1)} />
          </Collapsible>
          <Collapsible open={!!open.tasks} onToggle={() => toggle('tasks')} title="任务看板"
            count={taskCount > 0 ? `⚠ ${taskCount}` : undefined}
            hint={taskCount > 0 ? `${taskRisk.overdue} 过期 · ${taskRisk.stale} 卡住` : '会议纪要待办 → 待办 / 进行中 / 已完成'}>
            <TaskBoardPanel projectId={curId} onRisk={setTaskRisk} refreshSignal={refreshKey} />
          </Collapsible>

          <GroupLabel hint="任务书 / 场地 / 概念 … AI 解读 + 研判">判断解析</GroupLabel>
          <Collapsible open={!!open.cognition} onToggle={() => toggle('cognition')} title="项目解读" hint="任务书 / 场地 / 概念 … 一键 AI 解读">
            <CognitionSection projectId={curId} />
          </Collapsible>
          <Collapsible open={!!open.analysis} onToggle={() => toggle('analysis')} title="智能研判"
            count="前期分析 · 5 项" hint="总览 / 难点 / 诉求 / 推进计划 / 汇报提纲">
            <ProjectAnalysisPanel projectId={curId} />
          </Collapsible>
          <Collapsible open={!!open.stage} onToggle={() => toggle('stage')} title="阶段拆解">
            <StageProgressPanel projectId={curId} />
          </Collapsible>
        </main>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 14 }}>
          <div style={{ ...cardBase, padding: 16 }}>
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
          <div style={{ ...cardBase, padding: 16 }}>
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

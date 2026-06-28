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

/** 可折叠分区外壳(复用 .sec/data-open 折叠骨架):点标题展开/收起,默认折叠。
 *  纯包裹,不改内部任何功能。 */
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

/** 项目中心：原 ROM-AI 五段布局。项目下拉 / KPI 接新后端真实数据。
 *  当前项目走共享上下文（useProject）→ 共创营地/数据基地随之联动。 */
export default function ProjectCenterPage() {
  const { projects, curId, setCurId, cur, err, reload } = useProject()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const [renameErr, setRenameErr] = useState<string | null>(null)
  // 各内容块折叠状态;这 6 块默认展开,其余(未列=undefined)默认折叠。点标题切换。
  const [open, setOpen] = useState<Record<string, boolean>>({
    tencent: true, meeting: true, tasks: true, overview: true, stage: true, cognition: true, analysis: true,
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
  // 会议纪要回流后 +1，触发下方 KPI/里程碑/进度重新拉取（同页即时刷新）
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
    api
      .getProjectOverview(curId)
      .then((d) => alive && setOverview(d))
      .catch(() => {})
    api.getProjectMilestones(curId).then((d) => alive && setMilestones(d)).catch(() => {})
    api.getProjectRisks(curId).then((d) => alive && setRisks(d)).catch(() => {})
    api.getProjectReusableAssets(curId).then((d) => alive && setReuseTags(d)).catch(() => {})
    api.getProjectProgress(curId).then((d) => alive && setProgress(d)).catch(() => {})
    return () => {
      alive = false
    }
  }, [curId, refreshKey])

  return (
    <>
      <div className="ptitle">
        <h1>项目中心</h1>
        <div className="projsel">
          <div className="pick" onClick={() => setMenuOpen((v) => !v)}>
            ▾ 当前项目 · <b>{cur?.name ?? '（暂无项目）'}</b>
          </div>
          <div className={'projmenu' + (menuOpen ? ' show' : '')}>
            {projects.map((p) => (
              <button
                key={p.id}
                className={'projitem' + (p.id === curId ? ' on' : '')}
                onClick={() => {
                  setCurId(p.id)
                  setMenuOpen(false)
                }}
              >
                <div>
                  <div className="pi-name">{p.name}</div>
                  <div className="pi-meta">{p.description || '—'}</div>
                </div>
                <span className="pi-stage">{STAGE_CHIP[p.status] ?? p.status}</span>
              </button>
            ))}
            {projects.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--mut)' }}>
                暂无项目，可在「新建项目」接口创建
              </div>
            )}
          </div>
        </div>
        {/* 手动改名:文件夹原名太长时,用户自己精简(取名是人的判断,不靠规则猜) */}
        {cur && !renaming && (
          <span
            className="act"
            style={{ marginLeft: 6, color: 'var(--terra)', cursor: 'pointer', fontSize: 12 }}
            title="重命名当前项目"
            onClick={() => { setRenameVal(cur.name); setRenaming(true) }}
          >
            ✎ 改名
          </span>
        )}
        {cur && renaming && (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
            <input
              value={renameVal}
              autoFocus
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doRename(); if (e.key === 'Escape') setRenaming(false) }}
              style={{ fontSize: 13, padding: '2px 6px', border: '1px solid var(--line2)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--ink)' }}
            />
            <button className="anbtn" disabled={!renameVal.trim()} onClick={doRename}>存</button>
            <button className="anbtn" onClick={() => setRenaming(false)}>取消</button>
            {renameErr && <span style={{ fontSize: 11, color: 'var(--red)' }}>{renameErr}</span>}
          </span>
        )}
        <div style={{ display: 'flex', gap: 5, marginLeft: 6 }}>
          {cur?.city && <span className="chip">{cur.city}</span>}
          {cur && <span className="chip on">{STAGE_CHIP[cur.status] ?? cur.status}</span>}
          {cur?.client && <span className="chip">甲方 · {cur.client}</span>}
        </div>
      </div>

      {err && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--red)' }}>
          项目数据加载失败：{err}
        </div>
      )}

      <Collapsible open={!!open.progress} onToggle={() => toggle('progress')} title="阶段进度"
        hint={progress?.next_node ? `下一节点 · ${progress.next_node}${progress.next_due ? ' · ' + progress.next_due : ''}` : '下一节点 · 待接入项目里程碑'}>
        <div className="prog">
          <i style={{ width: `${progress?.pct ?? 0}%` }}></i>
        </div>
      </Collapsible>

      <Collapsible open={!!open.tencent} onToggle={() => toggle('tencent')} title="腾讯会议" hint="一键创建真实会议">
        <TencentMeetingCard projectId={curId} />
      </Collapsible>

      <Collapsible open={!!open.meeting} onToggle={() => toggle('meeting')} title="会议纪要" hint="创建会议 / 上传材料 / 纪要回流">
        <MeetingPanel projectId={curId} onReflowed={() => setRefreshKey((k) => k + 1)} />
      </Collapsible>

      <Collapsible open={!!open.tasks} onToggle={() => toggle('tasks')} title="任务看板"
        count={taskRisk.overdue + taskRisk.stale > 0 ? `⚠ ${taskRisk.overdue + taskRisk.stale}` : undefined}
        hint={taskRisk.overdue + taskRisk.stale > 0
          ? `${taskRisk.overdue} 过期 · ${taskRisk.stale} 卡住`
          : '会议纪要待办 → 待办 / 进行中 / 已完成'}>
        <TaskBoardPanel projectId={curId} onRisk={setTaskRisk} />
      </Collapsible>

      <Collapsible open={!!open.overview} onToggle={() => toggle('overview')} title="项目概览" hint="文件 / 会议 / 待办 / 风险 / 资产">
        <div className="grid4">
          <div className="metric">
            <div className="l">📄 文件</div>
            <div className="v">{overview ? overview.files : '—'}</div>
          </div>
          <div className="metric">
            <div className="l">📅 会议</div>
            <div className="v">{overview ? overview.meetings : '—'}</div>
          </div>
          <div className="metric">
            <div className="l">✓ 待办</div>
            <div className="v t">{overview ? overview.todos : '—'}</div>
          </div>
          <div className="metric">
            <div className="l">🔊 会议纪要</div>
            <div className="v t">{overview ? overview.minutes : '—'}</div>
          </div>
        </div>
        <div className="grid3 mt">
          <div className="metric">
            <div className="l">⚠ 风险</div>
            <div className="v r">{overview ? overview.risks : '—'}</div>
          </div>
          <div className="metric">
            <div className="l">◎ 成果缺口</div>
            <div className="v">{overview ? overview.gaps : '—'}</div>
          </div>
          <div className="metric">
            <div className="l">⟳ 可复用资产</div>
            <div className="v">{overview ? overview.assets : '—'}</div>
          </div>
        </div>
      </Collapsible>

      <Collapsible open={!!open.stage} onToggle={() => toggle('stage')} title="阶段拆解">
        <StageProgressPanel projectId={curId} />
      </Collapsible>

      <Collapsible open={!!open.cognition} onToggle={() => toggle('cognition')} title="项目解读" hint="任务书 / 场地 / 概念 … 一键 AI 解读">
        <CognitionSection projectId={curId} />
      </Collapsible>

      <Collapsible open={!!open.analysis} onToggle={() => toggle('analysis')} title="智能研判"
        count="前期分析 · 5 项" hint="总览 / 难点 / 诉求 / 推进计划 / 汇报提纲">
        <ProjectAnalysisPanel projectId={curId} />
      </Collapsible>

      {/* 甲方黑话词典:作为 ROM-AI 内在解读能力(后端研判/解读时使用),项目中心不再单独显示。 */}

      <Collapsible open={!!open.files} onToggle={() => toggle('files')} title="项目文件" hint="拖拽 / 选择上传 · txt/md/pdf/docx/pptx">
        <ProjectFilesPanel projectId={curId} />
      </Collapsible>

      <Collapsible open={!!open.milestones} onToggle={() => toggle('milestones')} title="里程碑 · 风险看板">
        <div className="grid2">
          <div className="card">
            <div className="ct">下一步 · 里程碑</div>
            <div id="pj-steps">
              {milestones.length === 0 ? (
                <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>
                  暂无里程碑。接入项目任务后在此显示（负责人 · 截止）。
                </div>
              ) : (
                milestones.map((m, i) => (
                  <div className="li" key={i}>
                    <span className="b" style={{ background: m.urgent ? 'var(--red)' : 'var(--terra)' }}></span>
                    {m.title}
                    <span className="who">{m.owner} · {m.due}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="card">
            <div className="ct">风险看板 · 可复用资产</div>
            <div id="pj-riskboard">
              {risks.length === 0 ? (
                <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>
                  暂无风险项。接入 AI 研判风险后在此显示。
                </div>
              ) : (
                risks.map((r, i) => (
                  <div className="li" key={i}>
                    <span className={'pill ' + (r.level === 'high' ? 'h' : 'm')}>
                      {r.level === 'high' ? '高' : '中'}
                    </span>
                    {r.text}
                  </div>
                ))
              )}
            </div>
            {reuseTags.length > 0 && (
              <div className="tags" style={{ marginTop: 10 }}>
                {reuseTags.map((t, i) => (
                  <span className="tg" key={i}>
                    <span className="k">{t.kind}</span>
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Collapsible>

      <Collapsible open={!!open.workspace} onToggle={() => toggle('workspace')} title="项目目录 · 读取与安全清理">
        <WorkspacePanel />
      </Collapsible>
    </>
  )
}

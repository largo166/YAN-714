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
import TencentMeetingCard from './TencentMeetingCard'
import WorkspacePanel from './WorkspacePanel'

const STAGE_CHIP: Record<string, string> = {
  active: '进行中',
  planning: '方案阶段',
  completed: '已完成',
}

/** 项目中心：原 ROM-AI 五段布局。项目下拉 / KPI 接新后端真实数据。
 *  当前项目走共享上下文（useProject）→ 共创营地/数据基地随之联动。 */
export default function ProjectCenterPage() {
  const { projects, curId, setCurId, cur, err } = useProject()
  const [menuOpen, setMenuOpen] = useState(false)
  const [overview, setOverview] = useState<ProjectOverview | null>(null)
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([])
  const [risks, setRisks] = useState<ProjectRisk[]>([])
  const [reuseTags, setReuseTags] = useState<ReusableAsset[]>([])
  const [progress, setProgress] = useState<ProjectProgress | null>(null)
  // 会议纪要回流后 +1，触发下方 KPI/里程碑/进度重新拉取（同页即时刷新）
  const [refreshKey, setRefreshKey] = useState(0)

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

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--mut)' }}>阶段进度</span>
          <span style={{ fontSize: 12, color: 'var(--terra)', fontWeight: 600 }}>
            {progress?.next_node
              ? `下一节点 · ${progress.next_node}${progress.next_due ? ' · ' + progress.next_due : ''}`
              : '下一节点 · 待接入项目里程碑'}
          </span>
        </div>
        <div className="prog">
          <i style={{ width: `${progress?.pct ?? 0}%` }}></i>
        </div>
      </div>

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

      <StageProgressPanel projectId={curId} />
      <CognitionSection projectId={curId} />

      <ProjectFilesPanel projectId={curId} />

      <ProjectAnalysisPanel projectId={curId} />

      <div className="grid2 mt">
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

      <TencentMeetingCard projectId={curId} />

      <MeetingPanel projectId={curId} onReflowed={() => setRefreshKey((k) => k + 1)} />

      <WorkspacePanel />
    </>
  )
}

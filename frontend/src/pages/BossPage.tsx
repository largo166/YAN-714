import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type { AiUsageItem, BossDashboard, Broadcast, WorkloadItem } from '@/types/schemas'

const LEVEL_LABEL: Record<string, string> = { high: '高', medium: '中', low: '低' }
const LEVEL_COLOR: Record<string, string> = {
  high: 'var(--red)',
  medium: 'var(--terra)',
  low: 'var(--ok)',
}

/** 管理驾驶舱：跨项目只读聚合，接真实后端（C5）。
 *  飞书看板/项目评论无真实集成 → not_configured 占位，绝不伪造（红线）。 */
export default function BossPage() {
  const [dash, setDash] = useState<BossDashboard | null>(null)
  const [workload, setWorkload] = useState<WorkloadItem[]>([])
  const [aiUsage, setAiUsage] = useState<AiUsageItem[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [feishuOk, setFeishuOk] = useState(false)
  const [commentsOk, setCommentsOk] = useState(false)
  const [bcText, setBcText] = useState('')

  const loadBroadcasts = useCallback(() => {
    api.listBroadcasts().then(setBroadcasts).catch(() => setBroadcasts([]))
  }, [])

  useEffect(() => {
    api.getBossDashboard().then(setDash).catch(() => setDash(null))
    api.getWorkload().then(setWorkload).catch(() => setWorkload([]))
    api.getAiUsage().then(setAiUsage).catch(() => setAiUsage([]))
    api.getFeishuBoard().then((r) => setFeishuOk(r.status === 'ok')).catch(() => setFeishuOk(false))
    api.getBossComments().then((r) => setCommentsOk(r.status === 'ok')).catch(() => setCommentsOk(false))
    loadBroadcasts()
  }, [loadBroadcasts])

  const publish = async () => {
    const t = bcText.trim()
    if (!t) return
    try {
      await api.createBroadcast(t)
      setBcText('')
      loadBroadcasts()
    } catch {
      // 失败不伪造成功
    }
  }

  return (
    <>
      <div className="ptitle">
        <h1>管理驾驶舱</h1>
        <span className="role-tip">🔒 仅管理员可见</span>
        <span className="adm">跨项目 · 只读聚合</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ct">
          发全员通知 <span style={{ fontWeight: 400, color: 'var(--mut)', fontSize: 11 }}>· 将出现在所有员工的「项目员工」信息带</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 8 }}>
          <input
            placeholder="输入要广播给全员的通知，例如：本周五下午 3 点市庄项目阶段评审，请相关同事预留时间"
            value={bcText}
            onChange={(e) => setBcText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && publish()}
            style={{ flex: 1, border: '1px solid var(--line2)', background: 'var(--panel2)', borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--ink)', outline: 'none' }}
          />
          <button className="btn" onClick={publish}>发布</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {broadcasts.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--mut)', padding: '7px 0' }}>暂无已发布通知。</div>
          )}
          {broadcasts.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink2)', padding: '7px 0', borderTop: '1px solid var(--line)' }}>
              <span>📢</span>
              <span style={{ flex: 1 }}>{b.text}</span>
              <span style={{ fontSize: 10, color: 'var(--mut)' }}>{b.created_at.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid4">
        <div className="metric"><div className="l">进行中项目</div><div className="v">{dash ? dash.active_projects : '—'}</div><div className="x">跨项目聚合</div></div>
        <div className="metric"><div className="l">临近交付</div><div className="v t">{dash ? dash.near_delivery : '—'}</div><div className="x">14 天内</div></div>
        <div className="metric"><div className="l">高风险项</div><div className="v r">{dash ? dash.high_risks : '—'}</div><div className="x">跨项目聚合</div></div>
        <div className="metric"><div className="l">AI 使用 · 本周</div><div className="v">{dash ? dash.ai_usage_week : '—'}</div><div className="x">次成果生成</div></div>
      </div>

      <div className="grid2 mt">
        <div className="card">
          <div className="ct">成员工作量 · 人工 / AI</div>
          {workload.length === 0 ? (
            <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>暂无工作量数据。</div>
          ) : (
            workload.map((w) => (
              <div className="wl" key={w.name}>
                <span className="nm">{w.name}</span>
                <div className="track"><i style={{ width: `${w.pct}%`, background: LEVEL_COLOR[w.level] ?? 'var(--terra)' }}></i></div>
                <span className="pct">{LEVEL_LABEL[w.level] ?? w.level}</span>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <div className="ct">AI 使用情况 · 按能力</div>
          {aiUsage.length === 0 ? (
            <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>暂无 AI 使用记录。</div>
          ) : (
            <div className="row">
              {aiUsage.map((a) => (
                <span className="tg" key={a.capability}><span className="k">{a.capability}</span>{a.count} 次</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="ct">
          飞书项目看板 · 合同进度<span className="fbtag">飞书同步</span>
        </div>
        {feishuOk ? (
          <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>（飞书看板数据）</div>
        ) : (
          <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>
            飞书未接入。配置飞书集成后在此显示合同进度与收款节点（当前不显示模拟数据）。
          </div>
        )}
      </div>

      <div className="card mt">
        <div className="ct">项目评论 · 通知到项目成员<span className="fbtag">飞书消息</span></div>
        {commentsOk ? (
          <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>（项目评论数据）</div>
        ) : (
          <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>
            飞书未接入。配置后可对项目写评论并通过飞书通知成员（当前不显示模拟评论）。
          </div>
        )}
      </div>
    </>
  )
}

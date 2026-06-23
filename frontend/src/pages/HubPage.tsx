import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type { Agent, TeamMember, TickerItem } from '@/types/schemas'

/** 协作平台：团队成员 + 智能助手卡 + 通知走马灯，接真实后端（C4）。
 *  无数据走空态/默认条目，不塞 mock（原则 9/13）。 */
export default function HubPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [ticker, setTicker] = useState<TickerItem[]>([])

  useEffect(() => {
    api.listTeamMembers().then(setMembers).catch(() => setMembers([]))
    api.listAgents().then(setAgents).catch(() => setAgents([]))
    api.getTicker().then(setTicker).catch(() => setTicker([]))
  }, [])

  // 走马灯需要可循环；为视觉滚动连续，内容复制一份
  const tickerItems = ticker.length ? [...ticker, ...ticker] : []

  return (
    <>
      <div className="ptitle">
        <h1>协作平台</h1>
      </div>

      <div className="hublabel">
        团队成员
        <div className="ticker">
          <div className="ticktrack">
            {tickerItems.length === 0 ? (
              <span className="tickitem">暂无通知 · 在驾驶舱发布全员通知后将在此滚动</span>
            ) : (
              tickerItems.map((t, i) => (
                <span className={t.kind === 'broadcast' ? 'tickitem bc' : 'tickitem'} key={i}>
                  {t.kind === 'broadcast' ? '📢 ' : '🎂 '}
                  {t.text}
                </span>
              ))
            )}
          </div>
        </div>
        <button className="btn ghost" style={{ padding: '7px 13px', fontSize: 12 }}>+ 添加成员</button>
      </div>
      <div className="grid3" style={{ marginBottom: 26 }}>
        {members.length === 0 && (
          <div style={{ color: 'var(--mut)', fontSize: 13, padding: '4px 2px' }}>
            暂无团队成员。点「添加成员」录入，或在共创营地录入人员后生成卡片。
          </div>
        )}
        {members.map((m) => (
          <div className="mem" key={m.id}>
            <div className="top">
              <span className="av human"></span>
              <div>
                <div className="nm">{m.name}</div>
                <div className="rl">{m.role}</div>
              </div>
              <span className="kind human">真实成员</span>
            </div>
            <div className="duty">
              <b>工作分工</b>
              <span className="dv">{m.duty || '—'}</span>
              <span className="ed">✎</span>
            </div>
            <div className="duty">
              <b>承担任务</b>
              <span style={{ color: 'var(--mut)' }}>未分派</span>
              <span className="pdis">项目中心分派</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hublabel">
        智能助手
        <span className="sub">中后期 Agent · 能力分阶段交付</span>
        <span className="ln2"></span>
      </div>
      <div className="grid3">
        {agents.map((a) => (
          <div className="mem" key={a.id}>
            <div className="top">
              <span className="av agent"></span>
              <div>
                <div className="nm">{a.name}</div>
                <div className="rl">{a.role}</div>
              </div>
              <span className={'stbadge ' + (a.status === 'ok' ? 'ok' : 'plan')}>
                {a.status === 'ok' ? '可用' : '规划中'}
              </span>
            </div>
            <div className="duty">
              <b>负责</b>
              {a.duty}
            </div>
            <div className="duty">
              <b>输出</b>
              {a.output}
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>智能助手目录加载中…</div>
        )}
      </div>
    </>
  )
}

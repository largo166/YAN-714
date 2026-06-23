import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import type { Agent, TeamMember, TickerItem } from '@/types/schemas'

/** 协作平台：团队成员 + 智能助手卡 + 通知走马灯，接真实后端（C4）。
 *  无数据走空态/默认条目，不塞 mock（原则 9/13）。成员录入/编辑接真实 POST/PUT。 */
export default function HubPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [ticker, setTicker] = useState<TickerItem[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', duty: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const [editDuty, setEditDuty] = useState('')

  const loadMembers = useCallback(() => {
    api.listTeamMembers().then(setMembers).catch(() => setMembers([]))
  }, [])

  useEffect(() => {
    loadMembers()
    api.listAgents().then(setAgents).catch(() => setAgents([]))
    api.getTicker().then(setTicker).catch(() => setTicker([]))
  }, [loadMembers])

  const submitNew = async () => {
    if (!form.name.trim()) return
    try {
      await api.createTeamMember({ name: form.name.trim(), role: form.role.trim(), duty: form.duty.trim() })
      setForm({ name: '', role: '', duty: '' })
      setAdding(false)
      loadMembers()
    } catch {
      // 失败不伪造成功
    }
  }

  const saveDuty = async (id: number) => {
    try {
      await api.updateTeamMember(id, { duty: editDuty })
      setEditId(null)
      loadMembers()
    } catch {
      // 忽略
    }
  }

  const removeMember = async (id: number, name: string) => {
    if (!window.confirm(`确认停用成员「${name}」？（软删除，可后续恢复）`)) return
    try {
      await api.deleteTeamMember(id)
      loadMembers()
    } catch {
      // 失败不伪造成功
    }
  }

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
        <button className="btn ghost" style={{ padding: '7px 13px', fontSize: 12 }} onClick={() => setAdding((v) => !v)}>
          {adding ? '收起' : '+ 添加成员'}
        </button>
      </div>
      {adding && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              placeholder="姓名（必填）"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              style={{ flex: '1 1 120px', minWidth: 120, padding: '8px 11px', border: '1px solid var(--line2)', borderRadius: 8, background: 'var(--panel2)', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}
            />
            <input
              placeholder="角色，如 建筑师"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              style={{ flex: '1 1 120px', minWidth: 120, padding: '8px 11px', border: '1px solid var(--line2)', borderRadius: 8, background: 'var(--panel2)', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}
            />
            <input
              placeholder="工作分工"
              value={form.duty}
              onChange={(e) => setForm((f) => ({ ...f, duty: e.target.value }))}
              style={{ flex: '2 1 200px', minWidth: 160, padding: '8px 11px', border: '1px solid var(--line2)', borderRadius: 8, background: 'var(--panel2)', fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)' }}
            />
            <button className="btn" onClick={submitNew} disabled={!form.name.trim()}>保存</button>
          </div>
        </div>
      )}
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
              <span
                title="停用成员（软删除）"
                onClick={() => removeMember(m.id, m.name)}
                style={{ cursor: 'pointer', color: 'var(--mut)', fontSize: 14, marginLeft: 4 }}
              >
                ✕
              </span>
            </div>
            <div className="duty">
              <b>工作分工</b>
              {editId === m.id ? (
                <>
                  <input
                    className="dv"
                    value={editDuty}
                    onChange={(e) => setEditDuty(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveDuty(m.id)}
                    autoFocus
                    style={{ border: '1px solid var(--line2)', borderRadius: 6, padding: '2px 6px', fontFamily: 'inherit', fontSize: 12.5, background: 'var(--panel2)', color: 'var(--ink)' }}
                  />
                  <span className="ed" style={{ cursor: 'pointer' }} onClick={() => saveDuty(m.id)}>✓</span>
                </>
              ) : (
                <>
                  <span className="dv">{m.duty || '—'}</span>
                  <span
                    className="ed"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setEditId(m.id)
                      setEditDuty(m.duty)
                    }}
                  >
                    ✎
                  </span>
                </>
              )}
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

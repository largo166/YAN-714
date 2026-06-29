import { useCallback, useEffect, useState } from 'react'

import { api, type ClientPortrait } from '@/lib/api'
import type { Agent, TeamMember, TickerItem } from '@/types/schemas'

/* 协作平台 · DC 暗色打磨（图标卡片/玻璃/霓虹）。数据全接真实后端（C4/C5），逻辑不动：
   团队成员 CRUD / 通知走马灯 / 甲方画像（仅汇已确认认知）/ 智能助手目录。
   红线：无数据走空态，不塞 mock；分派/发布/run 不在本页（指向项目中心/驾驶舱/共创营地）。 */

const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d', green: '#49d18d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674',
  line: 'rgba(255,255,255,.08)',
  glass: 'linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))',
}
const cardBase: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 18, background: C.glass }
const fieldStyle: React.CSSProperties = { background: 'rgba(255,255,255,.045)', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: 13, color: C.ink, outline: 'none' }

function Avatar({ text, kind }: { text: string; kind: 'human' | 'agent' }) {
  const grad = kind === 'agent' ? 'linear-gradient(135deg,#d7a86e,#36e6d4)' : 'linear-gradient(135deg,#7c5cff,#42a5ff)'
  const glow = kind === 'agent' ? 'rgba(54,230,212,.3)' : 'rgba(124,92,255,.35)'
  return (
    <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 13, background: grad, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 15, fontWeight: 700, boxShadow: `0 0 22px ${glow}` }}>{text}</div>
  )
}

function SecLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 14px' }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{title}</h2>
      {sub && <span style={{ fontSize: 12, color: C.mut }}>{sub}</span>}
      <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg,${C.line},transparent)` }} />
    </div>
  )
}

const dutyRow: React.CSSProperties = { fontSize: 12.5, color: C.ink2, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }
const dutyKey: React.CSSProperties = { color: C.mut, fontWeight: 600, fontSize: 11.5, flexShrink: 0 }

/** 协作平台：团队成员 + 智能助手卡 + 通知走马灯 + 甲方画像，接真实后端（C4）。 */
export default function HubPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [ticker, setTicker] = useState<TickerItem[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', duty: '' })
  const [editId, setEditId] = useState<number | null>(null)
  const [editDuty, setEditDuty] = useState('')
  // 甲方画像库(P1-E)
  const [clients, setClients] = useState<{ name: string; project_count: number }[]>([])
  const [selClient, setSelClient] = useState<string | null>(null)
  const [portrait, setPortrait] = useState<ClientPortrait | null>(null)

  const selectClient = (name: string) => {
    setSelClient(name)
    setPortrait(null)
    api.getClientPortrait(name).then(setPortrait).catch(() => setPortrait(null))
  }

  const loadMembers = useCallback(() => {
    api.listTeamMembers().then(setMembers).catch(() => setMembers([]))
  }, [])

  useEffect(() => {
    loadMembers()
    api.listAgents().then(setAgents).catch(() => setAgents([]))
    api.getTicker().then(setTicker).catch(() => setTicker([]))
    api.listClients().then((d) => setClients(d.items)).catch(() => setClients([]))
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
    <div style={{ color: C.ink, fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif", letterSpacing: '-.01em' }}>
      <header style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-.03em' }}>协作平台</h1>
        <p style={{ margin: '8px 0 0', color: C.mut, fontSize: 13 }}>团队 / 智能助手 / 甲方画像 一屏协作 —— 谁在做什么、卡在哪，一眼可见。</p>
      </header>

      {/* 团队成员 + 走马灯 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '0 0 14px' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff', flexShrink: 0 }}>团队成员</h2>
        <div className="ticker" style={{ flex: 1, minWidth: 0 }}>
          <div className="ticktrack">
            {tickerItems.length === 0 ? (
              <span className="tickitem" style={{ color: C.mut }}>暂无通知 · 在驾驶舱发布全员通知后将在此滚动</span>
            ) : (
              tickerItems.map((t, i) => (
                <span className="tickitem" key={i} style={{ color: t.kind === 'broadcast' ? '#a98bff' : C.gold }}>
                  {t.kind === 'broadcast' ? '📢 ' : '🎂 '}
                  {t.text}
                </span>
              ))
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{ flexShrink: 0, fontFamily: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, height: 32, padding: '0 13px', borderRadius: 10, border: `1px solid ${C.line}`, background: adding ? 'rgba(255,255,255,.05)' : 'transparent', color: C.ink2 }}
        >
          {adding ? '收起' : '+ 添加成员'}
        </button>
      </div>

      {adding && (
        <div style={{ ...cardBase, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="姓名（必填）" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ ...fieldStyle, flex: '1 1 120px', minWidth: 120 }} />
            <input placeholder="角色，如 建筑师" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} style={{ ...fieldStyle, flex: '1 1 120px', minWidth: 120 }} />
            <input placeholder="工作分工" value={form.duty} onChange={(e) => setForm((f) => ({ ...f, duty: e.target.value }))} style={{ ...fieldStyle, flex: '2 1 200px', minWidth: 160 }} />
            <button type="button" onClick={submitNew} disabled={!form.name.trim()} style={{ height: 38, padding: '0 16px', border: 0, borderRadius: 10, background: form.name.trim() ? 'linear-gradient(135deg,#7c5cff,#42a5ff)' : 'rgba(255,255,255,.08)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: form.name.trim() ? 'pointer' : 'not-allowed' }}>保存</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, marginBottom: 28 }}>
        {members.length === 0 && (
          <div style={{ color: C.mut, fontSize: 13, padding: '4px 2px' }}>暂无团队成员。点「添加成员」录入，或在共创营地录入人员后生成卡片。</div>
        )}
        {members.map((m) => (
          <div key={m.id} style={{ ...cardBase, padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Avatar text={m.name?.[0] || '人'} kind="human" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                <div style={{ fontSize: 12, color: C.mut }}>{m.role || '—'}</div>
              </div>
              <span style={{ fontSize: 10.5, color: C.cyan, border: `1px solid ${C.cyan}55`, background: `${C.cyan}18`, borderRadius: 7, padding: '2px 8px', whiteSpace: 'nowrap' }}>真实成员</span>
              <span title="停用成员（软删除）" onClick={() => removeMember(m.id, m.name)} style={{ cursor: 'pointer', color: C.mut, fontSize: 14 }}>✕</span>
            </div>
            <div style={dutyRow}>
              <b style={dutyKey}>工作分工</b>
              {editId === m.id ? (
                <>
                  <input value={editDuty} onChange={(e) => setEditDuty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveDuty(m.id)} autoFocus style={{ ...fieldStyle, flex: 1, padding: '3px 8px', fontSize: 12.5 }} />
                  <span style={{ cursor: 'pointer', color: C.cyan }} onClick={() => saveDuty(m.id)}>✓</span>
                </>
              ) : (
                <>
                  <span style={{ flex: 1 }}>{m.duty || '—'}</span>
                  <span style={{ cursor: 'pointer', color: C.mut }} onClick={() => { setEditId(m.id); setEditDuty(m.duty) }}>✎</span>
                </>
              )}
            </div>
            <div style={dutyRow}>
              <b style={dutyKey}>承担任务</b>
              {m.assignments.length === 0 ? (
                <span style={{ color: C.mut }}>未分派</span>
              ) : (
                <span style={{ flex: 1 }}>
                  {m.assignments.map((a, i) => (
                    <span key={i}>{i > 0 && '；'}{a.task_title}{a.due ? ` · ${a.due}` : ''}</span>
                  ))}
                </span>
              )}
              <span style={{ fontSize: 10, color: C.mut2, border: `1px solid ${C.line}`, borderRadius: 6, padding: '1px 6px' }}>项目中心分派</span>
            </div>
          </div>
        ))}
      </div>

      {/* 甲方画像库 */}
      <SecLabel title="甲方画像库" sub="同一甲方的项目 / 诉求 / 历史聚合（仅汇已确认认知，不伪造）" />
      <div style={{ ...cardBase, padding: 18, marginBottom: 28 }}>
        {clients.length === 0 ? (
          <div style={{ color: C.mut, fontSize: 13 }}>暂无甲方。给项目填上「甲方」后，这里按甲方聚合其项目与诉求/历史。</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: portrait ? 14 : 0 }}>
              {clients.map((c) => {
                const sel = selClient === c.name
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => selectClient(c.name)}
                    style={{ fontFamily: 'inherit', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, borderRadius: 99, padding: '6px 13px', border: `1px solid ${sel ? 'rgba(124,92,255,.55)' : C.line}`, background: sel ? 'rgba(124,92,255,.16)' : 'rgba(255,255,255,.04)', color: sel ? '#c8bcff' : C.ink2, boxShadow: sel ? '0 0 16px rgba(124,92,255,.25)' : 'none' }}
                  >
                    {c.name}（{c.project_count}）
                  </button>
                )
              })}
            </div>
            {portrait && (
              <div>
                <div style={{ fontSize: 13, marginBottom: 8 }}>
                  <b style={{ color: '#fff' }}>{portrait.client}</b> · {portrait.project_count} 个项目
                  {portrait.cities.length > 0 && <span style={{ color: C.mut }}>　🏙 {portrait.cities.join('、')}</span>}
                </div>
                {portrait.projects.map((p) => (
                  <div key={p.id} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 9, marginTop: 9 }}>
                    <div style={{ fontSize: 12.5 }}>
                      <b style={{ color: C.ink }}>{p.name}</b>
                      {p.city && <span style={{ color: C.mut }}>　{p.city}</span>}
                      <span style={{ marginLeft: 6, fontSize: 10.5, color: C.gold, border: `1px solid ${C.gold}44`, background: `${C.gold}14`, borderRadius: 6, padding: '1px 7px' }}>{p.status}</span>
                    </div>
                    {p.cognition.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 4 }}>暂无已确认认知（在项目中心「项目解读」确认后汇入）。</div>
                    ) : (
                      p.cognition.map((g, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: C.ink2, marginTop: 4 }}>
                          <span style={{ color: C.cyan }}>{g.module_label}：</span>
                          {g.summary}
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 智能助手 */}
      <SecLabel title="智能助手" sub="中后期 Agent · 能力分阶段交付" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14 }}>
        {agents.map((a) => {
          const ok = a.status === 'ok'
          return (
            <div key={a.id} style={{ ...cardBase, padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar text={a.name?.[0] || 'A'} kind="agent" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: C.mut }}>{a.role}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', borderRadius: 7, padding: '2px 9px', color: ok ? C.green : C.mut, border: `1px solid ${ok ? C.green + '55' : C.line}`, background: ok ? `${C.green}18` : 'rgba(255,255,255,.04)', boxShadow: ok ? `0 0 14px ${C.green}33` : 'none' }}>
                  {ok ? '可用' : '规划中'}
                </span>
              </div>
              <div style={dutyRow}><b style={dutyKey}>负责</b><span style={{ flex: 1 }}>{a.duty}</span></div>
              <div style={dutyRow}><b style={dutyKey}>输出</b><span style={{ flex: 1 }}>{a.output}</span></div>
            </div>
          )
        })}
        {agents.length === 0 && <div style={{ color: C.mut, fontSize: 12, padding: 8 }}>智能助手目录加载中…</div>}
      </div>
    </div>
  )
}

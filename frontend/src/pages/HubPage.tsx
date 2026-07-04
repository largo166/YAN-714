import { useCallback, useEffect, useState } from 'react'

import { Building2, Cake, Megaphone } from 'lucide-react'

import { api, type ClientPortrait } from '@/lib/api'
import BoardBackdrop from '@/lib/BoardBackdrop'
import { cn } from '@/lib/utils'
import type { Agent, TeamMember, TickerItem } from '@/types/schemas'

/* 协作平台 · DC 暗色打磨（图标卡片/玻璃/霓虹）。数据全接真实后端（C4/C5），逻辑不动：
   团队成员 CRUD / 通知走马灯 / 甲方画像（仅汇已确认认知）/ 智能助手目录。
   红线：无数据走空态，不塞 mock；分派/发布/run 不在本页（指向项目中心/驾驶舱/共创营地）。
   样式:P2 已收口——静态样式走 Tailwind token(DESIGN.md §10),内联只剩动态值。 */

const C = {
  gold: '#d7a86e', ink2: '#d8d4cc', line: 'rgba(255,255,255,.08)',
}
const glassCard = 'border border-solid border-line rounded-[18px] bg-[linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))]'
const fieldCls = 'bg-[rgba(255,255,255,.045)] border border-solid border-line rounded-[8px] py-2 px-[11px] [font-family:inherit] text-[13px] text-ink outline-none'
const dutyRowCls = 'text-[12.5px] text-ink-2 flex items-baseline gap-2 flex-wrap'
const dutyKeyCls = 'text-mut font-semibold text-[11.5px] shrink-0'

function Avatar({ text, kind }: { text: string; kind: 'human' | 'agent' }) {
  const grad = kind === 'agent' ? 'linear-gradient(135deg,#d7a86e,#36e6d4)' : 'linear-gradient(135deg,#7c5cff,#42a5ff)'
  const glow = kind === 'agent' ? 'rgba(54,230,212,.3)' : 'rgba(124,92,255,.35)'
  return (
    <div className="w-10 h-10 shrink-0 rounded-[13px] grid place-items-center text-white text-[15px] font-bold" style={{ background: grad, boxShadow: `0 0 22px ${glow}` }}>{text}</div>
  )
}

function SecLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-[10px] m-0 mb-[14px]">
      <h2 className="m-0 text-[17px] font-bold text-white">{title}</h2>
      {sub && <span className="text-[12px] text-mut">{sub}</span>}
      <span className="flex-1 h-px bg-[linear-gradient(90deg,rgba(255,255,255,.08),transparent)]" />
    </div>
  )
}

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

  // 通知静默轮播(晕动症红线:停用连续平移 .ticktrack,改 8s 单条淡入换条)
  const [tickIdx, setTickIdx] = useState(0)
  useEffect(() => {
    if (ticker.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const h = setInterval(() => setTickIdx((i) => i + 1), 8000)
    return () => clearInterval(h)
  }, [ticker.length])

  // 智能助手:可用的上卡片,规划中的收成「即将上岗」一行(真上线后自动升回卡片)
  const okAgents = agents.filter((a) => a.status === 'ok')
  const plannedAgents = agents.filter((a) => a.status !== 'ok')

  return (
    <div className="text-ink">
      {/* HERO 区:板块动态背景(轨道连线)只罩 头部+团队成员区(按小样,不铺全页) */}
      <section className="relative">
        <BoardBackdrop mode="aurora" />
        <div className="relative z-[1]">
      <header className="mb-[22px]">
        <h1 className="m-0 text-[32px] font-semibold tracking-[-0.025em]">协作平台</h1>
        <p className="m-0 mt-2 text-mut text-[13px]">团队 / 智能助手 / 甲方画像 一屏协作 —— 谁在做什么、卡在哪，一眼可见。</p>
      </header>

      {/* 团队成员 + 走马灯 */}
      <div className="flex items-center gap-[14px] m-0 mb-[14px]">
        <h2 className="m-0 text-[17px] font-bold text-white shrink-0">团队成员</h2>
        <div className="flex-1 min-w-0 overflow-hidden whitespace-nowrap">
          {ticker.length === 0 ? (
            <span className="text-[11.5px] text-mut">暂无通知 · 在驾驶舱发布全员通知后会在此轮播</span>
          ) : (() => {
            const t = ticker[tickIdx % ticker.length]
            return (
              <span key={tickIdx} className="tickfade inline-flex items-center gap-[5px] text-[11.5px] max-w-full overflow-hidden text-ellipsis" style={{ color: t.kind === 'broadcast' ? '#a98bff' : C.gold }}>
                {t.kind === 'broadcast' ? <Megaphone size={12} /> : <Cake size={12} />}
                <span className="overflow-hidden text-ellipsis">{t.text}</span>
                {ticker.length > 1 && <span className="text-mut-2 text-[10.5px] shrink-0">{(tickIdx % ticker.length) + 1}/{ticker.length}</span>}
              </span>
            )
          })()}
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="shrink-0 [font-family:inherit] cursor-pointer text-[12.5px] font-semibold h-8 py-0 px-[13px] rounded-[10px] border border-solid border-line text-ink-2"
          style={{ background: adding ? 'rgba(255,255,255,.05)' : 'transparent' }}
        >
          {adding ? '收起' : '+ 添加成员'}
        </button>
      </div>

      {adding && (
        <div className={cn(glassCard, 'p-[14px] mb-[14px]')}>
          <div className="flex gap-2 flex-wrap items-center">
            <input placeholder="姓名（必填）" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={cn(fieldCls, 'flex-[1_1_120px] min-w-[120px]')} />
            <input placeholder="角色，如 建筑师" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={cn(fieldCls, 'flex-[1_1_120px] min-w-[120px]')} />
            <input placeholder="工作分工" value={form.duty} onChange={(e) => setForm((f) => ({ ...f, duty: e.target.value }))} className={cn(fieldCls, 'flex-[2_1_200px] min-w-[160px]')} />
            <button type="button" onClick={submitNew} disabled={!form.name.trim()} className="h-9 py-0 px-[15px] border-0 rounded-[10px] text-white font-bold text-[13px] tracking-[.02em] [font-family:inherit]" style={{ background: form.name.trim() ? 'linear-gradient(135deg,#7c5cff,#42a5ff)' : 'rgba(255,255,255,.08)', cursor: form.name.trim() ? 'pointer' : 'not-allowed' }}>保存</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px] mb-7">
        {members.length === 0 && (
          <div className="text-mut text-[13px] py-1 px-[2px]">暂无团队成员。点「添加成员」录入，或在共创营地录入人员后生成卡片。</div>
        )}
        {members.map((m) => (
          <div key={m.id} className="ckcard p-4 flex flex-col gap-[11px]" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.2)' } as React.CSSProperties}>
            <div className="flex items-center gap-[11px]">
              <Avatar text={m.name?.[0] || '人'} kind="human" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-white truncate">{m.name}</div>
                <div className="text-[12px] text-mut">{m.role || '—'}</div>
              </div>
              <span title="停用成员（软删除）" onClick={() => removeMember(m.id, m.name)} className="cursor-pointer text-mut text-[14px]">✕</span>
            </div>
            <div className={dutyRowCls}>
              <b className={dutyKeyCls}>工作分工</b>
              {editId === m.id ? (
                <>
                  <input value={editDuty} onChange={(e) => setEditDuty(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveDuty(m.id)} autoFocus className={cn(fieldCls, 'flex-1 py-[3px] px-2 text-[12.5px]')} />
                  <span className="cursor-pointer text-brand-cyan" onClick={() => saveDuty(m.id)}>✓</span>
                </>
              ) : (
                <>
                  <span className="flex-1">{m.duty || '—'}</span>
                  <span className="cursor-pointer text-mut" onClick={() => { setEditId(m.id); setEditDuty(m.duty) }}>✎</span>
                </>
              )}
            </div>
            <div className={dutyRowCls}>
              <b className={dutyKeyCls}>承担任务</b>
              {m.assignments.length === 0 ? (
                <span className="text-mut">未分派</span>
              ) : (
                <span className="flex-1">
                  {m.assignments.map((a, i) => (
                    <span key={i}>{i > 0 && '；'}{a.task_title}{a.due ? ` · ${a.due}` : ''}</span>
                  ))}
                </span>
              )}
              <span className="text-[10px] text-mut-2 border border-solid border-line rounded-[6px] py-px px-[6px]">项目中心分派</span>
            </div>
          </div>
        ))}
      </div>
        </div>
      </section>

      {/* 甲方画像库(签名卡:渐变描边壳) */}
      <SecLabel title="甲方画像库" sub="同一甲方的项目 / 诉求 / 历史，一处聚合（只汇入已确认的认知）" />
      <div className="gshell mb-7">
        <div className="gshell-in p-[18px]">
        {clients.length === 0 ? (
          <div className="text-mut text-[13px]">暂无甲方。给项目填上「甲方」后，这里按甲方聚合其项目与诉求/历史。</div>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap" style={{ marginBottom: portrait ? 14 : 0 }}>
              {clients.map((c) => {
                const sel = selClient === c.name
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => selectClient(c.name)}
                    className="[font-family:inherit] cursor-pointer text-[12.5px] font-semibold rounded-[99px] py-[6px] px-[13px] border border-solid"
                    style={{ borderColor: sel ? 'rgba(124,92,255,.55)' : C.line, background: sel ? 'rgba(124,92,255,.16)' : 'rgba(255,255,255,.04)', color: sel ? '#c8bcff' : C.ink2, boxShadow: sel ? '0 0 16px rgba(124,92,255,.25)' : 'none' }}
                  >
                    {c.name}（{c.project_count}）
                  </button>
                )
              })}
            </div>
            {portrait && (
              <div>
                <div className="text-[13px] mb-2">
                  <b className="text-white">{portrait.client}</b> · {portrait.project_count} 个项目
                  {portrait.cities.length > 0 && <span className="text-mut">{'　'}<Building2 size={12} className="align-[-2px]" /> {portrait.cities.join('、')}</span>}
                </div>
                {portrait.projects.map((p) => (
                  <div key={p.id} className="border-t border-solid border-line pt-[9px] mt-[9px]">
                    <div className="text-[12.5px]">
                      <b className="text-ink">{p.name}</b>
                      {p.city && <span className="text-mut">{'　'}{p.city}</span>}
                      <span className="ml-[6px] text-[10.5px] text-brand-gold border border-solid border-brand-gold/[.27] bg-brand-gold/[.08] rounded-[6px] py-px px-[7px]">{p.status}</span>
                    </div>
                    {p.cognition.length === 0 ? (
                      <div className="text-[11.5px] text-mut mt-1">暂无已确认认知（在项目中心「项目解读」确认后汇入）。</div>
                    ) : (
                      p.cognition.map((g, i) => (
                        <div key={i} className="text-[11.5px] text-ink-2 mt-1">
                          <span className="text-brand-cyan">{g.module_label}：</span>
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
      </div>

      {/* 智能助手:只上可用的卡片;规划中的收成「即将上岗」一行,不占卡位 */}
      <SecLabel title="智能助手" sub="AI 同事 · 能力分阶段上岗" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[14px]">
        {okAgents.map((a) => (
          <div key={a.id} className="ckcard p-4 flex flex-col gap-[11px]" style={{ ['--ac']: 'linear-gradient(90deg,#7c5cff,#42a5ff)', ['--gl']: 'rgba(124,92,255,.2)' } as React.CSSProperties}>
            <div className="flex items-center gap-[11px]">
              <Avatar text={a.name?.[0] || 'A'} kind="agent" />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold text-white">{a.name}</div>
                <div className="text-[12px] text-mut">{a.role}</div>
              </div>
              <span className="text-[10.5px] font-bold whitespace-nowrap rounded-[7px] py-[2px] px-[9px] text-brand-green border border-solid border-brand-green/[.33] bg-brand-green/[.094] shadow-[0_0_14px_rgba(73,209,141,.2)]">可用</span>
            </div>
            <div className={dutyRowCls}><b className={dutyKeyCls}>负责</b><span className="flex-1">{a.duty}</span></div>
            <div className={dutyRowCls}><b className={dutyKeyCls}>输出</b><span className="flex-1">{a.output}</span></div>
          </div>
        ))}
        {okAgents.length === 0 && agents.length > 0 && <div className="text-mut text-[13px] py-1 px-[2px]">智能助手筹备中,能力分阶段上岗。</div>}
        {agents.length === 0 && <div className="text-mut text-[12px] p-2">智能助手目录加载中…</div>}
      </div>
      {plannedAgents.length > 0 && (
        <div className="flex items-center gap-2 mt-3 text-mut-2 text-[12px] flex-wrap">
          <span className="w-[7px] h-[7px] rounded-full bg-mut-2 shrink-0" />
          即将上岗：{plannedAgents.map((a) => a.name).join(' · ')}
        </div>
      )}
    </div>
  )
}

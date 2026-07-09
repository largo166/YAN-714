import { useState } from 'react'

import type { ClientPortrait } from '@/lib/api'

import { boardImages } from '../../data/boardImages'
import type { HubLive } from '../../hooks/useHubLive'
import { hubService as hs } from '../../services'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Popover } from '../common/Modal'
import { Dot, GhostButton, Label, Pill } from '../common/PillButton'
import { StatBlock } from '../common/StatBlock'

/* ═══ b3 协作平台:横幅+三列(构图冻结)——成员/甲方画像/智能体/通知全接真 ═══
   封板可信度包(2026-07-08):live.err 板内可见(错误不再伪装成空态);
   甲方画像 pill 接线 getClientPortrait(全 app 唯一假按钮清零);智能助手列补空态。 */

export function HubBoard({ active: _active, live }: { active: boolean; live: HubLive }) {
  const img = boardImages.hub
  /* live 由 AppShell 汇聚层(useBoardLive)传入,不再自调 useHubLive——单一数据源(hotfix1) */
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', role: '' })
  const [addErr, setAddErr] = useState('')
  /* 甲方画像浮层:点 pill 拉真画像(已确认认知摘要),三态齐 */
  const [portraitOf, setPortraitOf] = useState<string | null>(null)
  const [portrait, setPortrait] = useState<ClientPortrait | null>(null)
  const [portraitBusy, setPortraitBusy] = useState(false)
  const [portraitErr, setPortraitErr] = useState('')

  const latestBroadcast = live.broadcasts[0]?.text ?? null
  const onDutyAgents = live.agents.filter((a) => a.status === 'ok')
  const plannedAgents = live.agents.filter((a) => a.status !== 'ok')

  const openPortrait = async (name: string) => {
    setPortraitOf(name)
    setPortrait(null)
    setPortraitErr('')
    setPortraitBusy(true)
    try {
      setPortrait(await hs.getClientPortrait(name))
    } catch (e) {
      setPortraitErr((e as Error).message)
    } finally {
      setPortraitBusy(false)
    }
  }

  const addMember = async () => {
    if (!draft.name.trim()) return
    setAddErr('')
    try {
      await hs.createTeamMember({ name: draft.name.trim(), role: draft.role.trim() })
      setDraft({ name: '', role: '' })
      setAdding(false)
      live.reloadMembers()
    } catch (e) {
      setAddErr((e as Error).message)
    }
  }

  return (
    <div className="absolute inset-0 flex flex-col gap-4 p-[22px] px-11 pb-5">
      {/* 横幅主角 */}
      <figure className="relative m-0 h-[47%] flex-none overflow-hidden rounded-skpanel border-[0.5px] border-sk-border" data-in>
        {img && <img src={img.src} alt="团队空间" className="absolute inset-0 h-full w-full object-cover [filter:saturate(.9)]" />}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(10,12,14,.82) 8%, rgba(10,12,14,.4) 46%, rgba(10,12,14,.12))' }}
        />
        <div className="absolute bottom-6 left-[30px] z-[2] flex max-w-[60%] flex-col gap-3">
          <Label>Hub{'　'}团队协同</Label>
          <div className="font-skcjk text-[31px] font-light tracking-[0.14em] [text-indent:0.14em] text-sk-fg">
            谁在做什么<span className="sk-accent-text">{'　'}一眼可见</span>
          </div>
          <div className="flex items-center gap-[9px] font-skcjk text-[12px] font-light tracking-[0.08em] text-[#cfd4d8]">
            <Dot tone="ok" glow />
            {latestBroadcast ?? '驾驶舱发布的全员通知在此轮播 · 暂无通知'}
          </div>
        </div>
        <div className="absolute bottom-[22px] right-[26px] z-[2] flex gap-[34px]">
          <StatBlock value={live.loading ? '…' : String(live.members.length)} label="团队成员" compact />
          <StatBlock value={live.loading ? '…' : String(onDutyAgents.length)} label="智能助手在岗" tone="pri" compact />
          <StatBlock value={live.loading ? '…' : String(live.clients.length)} label="甲方画像" compact />
        </div>
      </figure>

      {/* 数据加载失败可见(封板可信度:错误≠空库,四源任一失败在此如实提示 + 一键重试) */}
      {live.err && (
        <div className="flex items-center gap-3 font-skcjk text-[12px] font-light text-sk-risk" data-in>
          <span>{live.err}</span>
          <GhostButton onClick={live.reload} className="px-3 py-1 text-[10.5px]">重试 ↻</GhostButton>
        </div>
      )}

      {/* 三列(构图不变,数据全真) */}
      <div className="flex min-h-0 flex-1 gap-4" data-in>
        <GlassCard className="flex-1">
          <CardHead
            title="团队成员"
            en="Team"
            right={<GhostButton className="px-3.5 py-[5px]" onClick={() => setAdding((a) => !a)}>+ 添加成员</GhostButton>}
          />
          <div className="sk-scroll min-h-0 flex-1 overflow-y-auto">
            {adding && (
              <div className="flex items-center gap-2 border-b-[0.5px] border-sk-hairsoft py-2">
                <input
                  className="w-[88px] border-0 border-b border-sk-hair bg-transparent font-skcjk text-[12.5px] font-light text-sk-fg outline-none placeholder:text-sk-muted2"
                  placeholder="姓名"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <input
                  className="min-w-0 flex-1 border-0 border-b border-sk-hair bg-transparent font-skcjk text-[12.5px] font-light text-sk-fg outline-none placeholder:text-sk-muted2"
                  placeholder="角色 · 职责"
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void addMember() }}
                />
                <GhostButton pri className="px-3 py-[4px]" onClick={() => void addMember()}>存</GhostButton>
              </div>
            )}
            {addErr && <div className="py-1 font-skcjk text-[11.5px] font-light text-sk-risk">{addErr}</div>}
            {!live.loading && live.members.length === 0 && (
              <div className="py-2 font-skcjk text-[12px] font-light text-sk-muted">还没有成员。点右上「+ 添加成员」把团队请进来。</div>
            )}
            {live.members.map((m) => (
              <MemberRow
                key={m.id}
                g={m.name.slice(0, 1)}
                name={m.name}
                role={m.role || m.duty || '—'}
                right={
                  m.assignments.length > 0 ? (
                    <Pill tone={m.assignments.length >= 3 ? 'warn' : 'ok'}>{m.assignments.length} 项任务</Pill>
                  ) : (
                    <Pill>空闲</Pill>
                  )
                }
              />
            ))}
          </div>
        </GlassCard>
        <GlassCard className="flex-1">
          <CardHead title="甲方画像库" en="Clients" />
          <div className="relative mt-0.5 flex flex-wrap gap-2">
            {!live.loading && live.clients.length === 0 && (
              <span className="font-skcjk text-[12px] font-light text-sk-muted">
                暂无甲方画像。项目里填写「甲方」字段后,同一甲方会在此聚合。
              </span>
            )}
            {live.clients.map((c) => (
              <button
                key={c.name}
                onClick={() => void openPortrait(c.name)}
                className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-[15px] py-1.5 font-skcjk text-[12px] font-light tracking-[0.1em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
              >
                {c.name}({c.project_count})
              </button>
            ))}
            {/* 画像浮层(Portal 到 #sk-overlay,不压 KPI):项目清单 + 已确认认知摘要,三态齐 */}
            <Popover open={portraitOf != null} onClose={() => setPortraitOf(null)} title={portraitOf ?? ''} note="甲方画像 · 已确认认知">
              {portraitBusy && <div className="font-skcjk text-[12px] font-light text-sk-muted2">画像加载中…</div>}
              {portraitErr && <div className="font-skcjk text-[12px] font-light text-sk-risk">画像加载失败:{portraitErr}</div>}
              {portrait && portrait.projects.length === 0 && (
                <div className="font-skcjk text-[12px] font-light text-sk-muted">暂无画像数据。该甲方的项目完成认知确认后,摘要会在此聚合。</div>
              )}
              {portrait && portrait.projects.length > 0 && (
                <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
                  {portrait.cities.length > 0 && (
                    <div className="font-skcjk text-[11px] font-light text-sk-muted2">城市:{portrait.cities.join(' · ')}</div>
                  )}
                  {portrait.projects.map((p) => (
                    <div key={p.id} className="border-b-[0.5px] border-sk-hairsoft pb-2 last:border-b-0">
                      <div className="font-skcjk text-[12.5px] font-normal text-sk-fg">{p.name}{p.city ? ` · ${p.city}` : ''}</div>
                      {p.cognition.length === 0 && (
                        <div className="mt-0.5 font-skcjk text-[11px] font-light text-sk-muted2">尚无已确认认知。</div>
                      )}
                      {p.cognition.map((cg, i) => (
                        <div key={i} className="mt-0.5 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">
                          <span className="text-sk-primary">{cg.module_label}</span> {cg.summary}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Popover>
          </div>
          <div className="font-skcjk text-[12.5px] font-light leading-[2.05] tracking-[0.03em] text-sk-muted">
            同一甲方的项目 / 诉求 / 历史{'　'}一处聚合{'　'}点开即读其审美偏好与决策习惯
          </div>
        </GlassCard>
        <GlassCard className="flex-1">
          <CardHead title="智能助手" en="AI Staff" right={<HeadNote>分阶段上岗</HeadNote>} />
          <div className="sk-scroll min-h-0 flex-1 overflow-y-auto">
            {!live.loading && live.agents.length === 0 && (
              <div className="py-2 font-skcjk text-[12px] font-light text-sk-muted">暂无智能助手。后端接入智能体后在此上岗。</div>
            )}
            {onDutyAgents.map((a) => (
              <MemberRow key={a.id} g={a.name.slice(0, 1)} name={a.name} role={a.duty} right={<Pill tone="ok">可用</Pill>} />
            ))}
            {plannedAgents.length > 0 && (
              <MemberRow
                g="待"
                name={plannedAgents.map((a) => a.name).join(' · ')}
                role="即将上岗"
                dimAvatar
                dimName
              />
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function MemberRow({
  g,
  name,
  role,
  right,
  dimAvatar,
  dimName,
}: {
  g: string
  name: string
  role: string
  right?: React.ReactNode
  dimAvatar?: boolean
  dimName?: boolean
}) {
  return (
    <div className="flex items-center gap-[13px] border-b-[0.5px] border-sk-hairsoft py-[9px] last:border-b-0">
      <div
        className="grid h-[34px] w-[34px] flex-none place-items-center rounded-sktile border-[0.5px] border-[rgba(127,179,207,.4)] font-skcjk text-[13px] font-normal text-sk-primary"
        style={dimAvatar ? { opacity: 0.45 } : undefined}
      >
        {g}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-skcjk text-[13.5px] font-normal tracking-[0.06em] ${dimName ? 'text-sk-muted' : 'text-sk-fg'}`}>{name}</div>
        <div className="mt-0.5 font-skcjk text-[11px] font-light tracking-[0.05em] text-sk-muted2">{role}</div>
      </div>
      {right}
    </div>
  )
}

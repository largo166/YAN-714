import { useMemo, useState, type KeyboardEvent } from 'react'

import { useCockpitLive } from '../../hooks/useCockpitLive'
import { PROJ_COLORS } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Dot, GhostButton, Label } from '../common/PillButton'
import { MRow } from '../common/StatBlock'

/* ═══ b4 管理驾驶舱:数据网格(构图冻结)——真门禁+真数据 ═══
   门禁只落 b4(boot 闸保持仪式性,决策A);甜甜圈/工作量/广播/大盘全真源;
   日历=里程碑单源前端聚合(降级预案已批:含日期的里程碑上墙,自然语言 due 不伪造日期) */

const USAGE_COLORS = ['#7fb3cf', '#4f7f9e', '#a8cfe0', '#5f93ad', '#d7e5ec', '#c9b27f']

export function CockpitBoard({
  active,
  curIdx,
  projectIds,
  projectNames,
}: {
  active: boolean
  curIdx: number
  projectIds: number[]
  projectNames: string[]
}) {
  const live = useCockpitLive(active, projectIds)

  if (live.gate !== 'open') {
    return <GateView gate={live.gate} err={live.gateErr} onUnlock={live.unlock} onSetup={live.setup} />
  }
  return <CockpitInner live={live} curIdx={curIdx} projectNames={projectNames} />
}

/* ── 门禁视图(海天口令语言:点点+进度线,与 boot 闸同家族) ── */
function GateView({
  gate,
  err,
  onUnlock,
  onSetup,
}: {
  gate: 'checking' | 'locked' | 'setup'
  err: string
  onUnlock: (pw: string) => Promise<void>
  onSetup: (pw: string) => Promise<void>
}) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (pw.length < 4 || busy) return
    setBusy(true)
    await (gate === 'setup' ? onSetup(pw) : onUnlock(pw))
    setBusy(false)
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-[22px]">
      <Label>Cockpit Access{'　'}{gate === 'setup' ? '首次设置管理口令' : '管理驾驶舱已锁定'}</Label>
      <div className="font-skcjk text-[13px] font-light tracking-[0.1em] text-sk-muted">
        {gate === 'checking' ? '正在核对门禁状态…' : gate === 'setup' ? '设置一个本机口令(仅加盐哈希存本机,不上传)' : '输入管理口令进入 · 只读大盘'}
      </div>
      {gate !== 'checking' && (
        <>
          <input
            type="password"
            className="w-[300px] border-0 border-b-2 border-sk-hairsoft bg-transparent pb-2 text-center font-sans text-[22px] tracking-[0.4em] text-sk-fg outline-none transition-colors focus:border-sk-primary"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
          <GhostButton pri onClick={() => void submit()}>
            {busy ? '验证中…' : gate === 'setup' ? '设置并进入' : '解锁'}
          </GhostButton>
        </>
      )}
      {err && <div className="font-skcjk text-[12px] font-light text-sk-risk">{err}</div>}
    </div>
  )
}

/* ── 解锁后主体(构图=数据网格,冻结) ── */
function CockpitInner({
  live,
  curIdx,
  projectNames,
}: {
  live: ReturnType<typeof useCockpitLive>
  curIdx: number
  projectNames: string[]
}) {
  const total = live.usage.reduce((n, u) => n + u.count, 0)
  const conic = useMemo(() => {
    if (total === 0) return 'conic-gradient(rgba(242,241,238,.08) 0% 100%)'
    let acc = 0
    const stops = live.usage.map((u, i) => {
      const from = (acc / total) * 100
      acc += u.count
      const to = (acc / total) * 100
      return `${USAGE_COLORS[i % USAGE_COLORS.length]} ${from}% ${to}%`
    })
    return `conic-gradient(${stops.join(',')})`
  }, [live.usage, total])

  const [draft, setDraft] = useState('')
  const [sendState, setSendState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const [sendErr, setSendErr] = useState('')
  const send = async () => {
    const t = draft.trim()
    if (!t || sendState === 'busy') return
    setSendState('busy')
    try {
      await live.sendBroadcast(t)
      setDraft('')
      setSendState('ok')
    } catch (e) {
      setSendErr((e as Error).message)
      setSendState('err')
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void send()
  }

  /* 日历:2026-07 月视图骨架不变,事件=真里程碑聚合 */
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() /* 0-based */
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 /* 周一=0 */
  const today = now.getDate()
  const evByDay = useMemo(() => {
    const m = new Map<number, { label: string; projIdx: number }[]>()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    for (const e of live.calEvents) {
      if (!e.date.startsWith(prefix)) continue
      const d = Number(e.date.slice(8, 10))
      if (!m.has(d)) m.set(d, [])
      m.get(d)!.push({ label: e.label, projIdx: e.projIdx })
    }
    return m
  }, [live.calEvents, year, month])

  return (
    <div className="absolute inset-0 flex flex-col gap-3.5 p-5 px-11">
      {/* 细头带:eyebrow + 真 KPI */}
      <div className="flex flex-none items-baseline gap-[26px]" data-in>
        <Label>Cockpit{'　'}只读大盘 · 跨项目聚合 不打扰执行</Label>
        <div className="ml-auto flex gap-[26px]">
          {([
            [String(total), 'AI 成果 · 累计', 'pri'],
            [String(live.dash?.active_projects ?? '—'), '进行中项目', ''],
            [String(live.dash?.high_risks ?? '—'), '高风险项', 'risk'],
            [String(live.dash?.ai_usage_week ?? '—'), '本周 AI 调用', ''],
          ] as const).map(([v, k, tone]) => (
            <span key={k} className="flex items-baseline gap-[9px] font-skcjk text-[11px] font-light tracking-[0.1em] text-sk-muted2">
              <b
                className={cn(
                  'font-sans text-[23px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]',
                  tone === 'pri' && 'text-sk-primary',
                  tone === 'risk' && 'text-sk-risk',
                )}
              >
                {v}
              </b>
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* 数据加载失败可见(封板可信度:错误≠空库,失败源如实点名,不再静默成空态) */}
      {live.err && (
        <div className="flex-none font-skcjk text-[12px] font-light text-sk-risk" data-in>{live.err}</div>
      )}

      {/* 数据网格:a b | c(日历主角) / d d | c */}
      <div
        className="grid min-h-0 flex-1 gap-3.5"
        style={{
          gridTemplateColumns: '1fr 1fr 1.35fr',
          gridTemplateRows: '1.22fr 0.78fr',
          gridTemplateAreas: "'a b c' 'd d c'",
        }}
        data-in
      >
        <GlassCard style={{ gridArea: 'a' }}>
          <CardHead title="AI 使用情况" en="AI Usage" right={<HeadNote>能力分布 · 真实计数</HeadNote>} />
          <div className="flex flex-1 items-center gap-[26px]">
            <div className="grid h-[118px] w-[118px] flex-none place-items-center rounded-full" style={{ background: conic }}>
              <div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-[#0d1013] text-center">
                <div>
                  <div className="font-sans text-[22px] font-medium leading-none text-sk-fg">{total}</div>
                  <div className="mt-1 text-[9px] tracking-[0.2em] text-sk-muted2">次成果</div>
                </div>
              </div>
            </div>
            <div className="grid flex-1 gap-2">
              {live.usage.length === 0 && !live.loading && (
                <span className="font-skcjk text-[12px] font-light text-sk-muted">还没有 AI 成果。营地跑一次技能后,分布会出现在这里。</span>
              )}
              {live.usage.map((u, i) => (
                <div key={u.capability} className="flex items-center gap-[9px] font-skcjk text-[12px] font-light tracking-[0.06em] text-sk-muted">
                  <span className="h-[9px] w-[9px] flex-none rounded-[2.5px]" style={{ background: USAGE_COLORS[i % USAGE_COLORS.length] }} />
                  {u.capability}
                  <span className="ml-auto font-sans font-medium text-[#c9ccd0]">{u.count}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ gridArea: 'b' }}>
          <CardHead title="成员工作量" en="Workload" right={<HeadNote>负荷 · 真实分布</HeadNote>} />
          <div className="mt-1 grid gap-[15px]">
            {live.workload.length === 0 && !live.loading && (
              <span className="font-skcjk text-[12px] font-light text-sk-muted">
                暂无工作量数据。到协作平台添加成员并分派任务后,负荷会出现在这里。
              </span>
            )}
            {live.workload.map((w) => (
              <div key={w.name} className="grid grid-cols-[64px_1fr_44px] items-center gap-[13px]">
                <span className="font-skcjk text-[12.5px] font-light text-sk-muted">{w.name}</span>
                <div className="flex h-[5px] overflow-hidden rounded-[3px] bg-[rgba(242,241,238,.05)]">
                  <i className="block h-full" style={{ width: `${Math.min(100, w.pct)}%`, background: '#7fb3cf' }} />
                </div>
                <span
                  className="text-right font-skcjk text-[9.5px] tracking-[0.1em]"
                  style={{ color: w.level === 'high' ? 'var(--sk-risk)' : w.level === 'medium' ? 'var(--sk-warn)' : 'var(--sk-ok)' }}
                >
                  {w.level === 'high' ? '超载' : w.level === 'medium' ? '偏高' : '正常'}
                </span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard style={{ gridArea: 'c' }}>
          <CardHead title={`项目日历 · ${year}-${String(month + 1).padStart(2, '0')}`} en="Calendar" right={<HeadNote>里程碑聚合</HeadNote>} />
          {live.calEvents.length === 0 && (
            <div className="font-skcjk text-[11px] font-light text-sk-muted2">
              本月暂无带日期的里程碑(自然语言期限如「周五前」不上墙,不伪造日期)。
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5">
            <div className="grid flex-1 grid-cols-7 gap-1">
              {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                <span key={d} className="py-0.5 text-center font-sans text-[8.5px] font-medium uppercase tracking-[0.22em] text-sk-muted2">
                  {d}
                </span>
              ))}
              {Array.from({ length: firstDow }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const evs = evByDay.get(day)
                return (
                  <span
                    key={day}
                    className={cn(
                      'relative min-h-[34px] rounded-lg border-[0.5px] border-transparent p-[5px] px-[7px] font-sans text-[11px] font-normal text-sk-muted transition-colors duration-200 hover:border-sk-hair',
                      day === today && 'border-[rgba(127,179,207,.5)] text-sk-primary',
                    )}
                    title={evs?.map((e) => `${projectNames[e.projIdx] ?? ''} · ${e.label}`).join('\n')}
                  >
                    {day}
                    {evs && (
                      <span className="absolute bottom-[5px] left-[7px] right-[7px] flex gap-[3px]">
                        {evs.slice(0, 3).map((e, i) => (
                          <i
                            key={i}
                            className="block h-[3px] flex-1 rounded-[2px]"
                            style={{ background: PROJ_COLORS[e.projIdx % PROJ_COLORS.length], opacity: e.projIdx === curIdx ? 1 : 0.45 }}
                          />
                        ))}
                      </span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        </GlassCard>

        <GlassCard style={{ gridArea: 'd' }}>
          <CardHead title="发全员通知" en="Broadcast" right={<HeadNote>发布即上协作平台横幅</HeadNote>} />
          <div className="flex items-start gap-[30px]">
            <div className="sk-cmdline flex flex-[1.1] items-center gap-3.5 border-b-2 border-sk-hairsoft px-0.5 pb-2.5 pt-1.5">
              <input
                className="flex-1 border-0 bg-transparent font-skcjk text-[15px] font-light tracking-[0.06em] text-sk-fg outline-none placeholder:text-sk-muted2"
                placeholder="输入要广播给全员的通知…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
              />
              <button
                className="cursor-pointer rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-transparent px-[18px] py-[7px] font-sans text-[10px] font-medium uppercase tracking-[0.24em] text-sk-primary transition-colors duration-200 hover:bg-sk-primary hover:text-[#0a0c0e]"
                onClick={() => void send()}
              >
                {sendState === 'busy' ? '…' : '发布'}
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {sendState === 'err' && <div className="font-skcjk text-[11.5px] font-light text-sk-risk">发布失败:{sendErr}</div>}
              {live.broadcasts.slice(0, 2).map((b) => (
                <MRow key={b.id} compact noBorder lead={<Dot tone="ok" />} text={b.text} who={b.created_at.slice(5, 10)} />
              ))}
              {live.broadcasts.length === 0 && <div className="font-skcjk text-[11.5px] font-light text-sk-muted2">暂无历史通知。在上方输入框发送第一条,通知会归档到这里。</div>}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'

import { Lock, Megaphone } from 'lucide-react'

import { api } from '@/lib/api'
import BoardBackdrop from '@/lib/BoardBackdrop'
import { CountNum } from '@/lib/useCountUp'
import type { AiUsageItem, BossDashboard, Broadcast, WorkloadItem } from '@/types/schemas'

/* 管理驾驶舱 · 暗色重写（吸取 DC 暗色霓虹 / 图标卡片 / 数据可视化）。
   红线：只渲染真实后端聚合数据（dash/workload/aiUsage/broadcasts）；
   DC 原型里的假图表（健康度 86 / 按期率 / 中标率 / 风险项目表）一律不编，缺数据走空态。
   飞书看板 / 项目评论无真实集成 → not_configured 占位，绝不伪造。
   样式:P2 已收口——静态样式走 Tailwind token(DESIGN.md §10),内联只剩动态值。 */

const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d', green: '#49d18d',
  ink: '#f4f1ea', mut2: '#5f6674', line: 'rgba(255,255,255,.08)',
}
const DONUT_PALETTE = [C.purple, C.blue, C.cyan, C.gold, C.amber, C.red, C.green]

const LEVEL_LABEL: Record<string, string> = { high: '偏高', medium: '适中', low: '较轻' }
const LEVEL: Record<string, { color: string; grad: string }> = {
  high: { color: '#ff8f93', grad: 'linear-gradient(90deg,#ff5e66,#fdab3d)' },
  medium: { color: '#d8d4cc', grad: 'linear-gradient(90deg,#42a5ff,#7c5cff)' },
  low: { color: '#49d18d', grad: 'linear-gradient(90deg,#49d18d,#36e6d4)' },
}

const glassCard = 'border border-solid border-line rounded-[22px] bg-[linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))]'
const gradBtn = 'h-9 py-0 px-[15px] border-0 rounded-[10px] bg-[linear-gradient(135deg,#7c5cff,#42a5ff)] text-white font-bold text-[13px] tracking-[.02em] [font-family:inherit] cursor-pointer'

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-[10px] mb-4">
      <h2 className="m-0 text-[17px] font-bold text-white">{children}</h2>
      {hint && <span className="text-[12px] text-mut">{hint}</span>}
    </div>
  )
}

/** 签名 KPI 带内的大数字单元(44px/700/tabular,单元间 1px 竖分隔;标尺见 DESIGN.md 第 2 节 HERO KPI) */
function HeroKpi({ label, value, caption, color, first }: { label: string; value: React.ReactNode; caption: string; color?: string; first?: boolean }) {
  return (
    <div className={`flex-[1_1_150px] min-w-[150px] py-[2px] px-[22px] ${first ? '' : 'border-l border-solid border-line'}`}>
      <div className="text-mut text-[12.5px]">{label}</div>
      <div className="mt-[10px] text-[44px] font-bold tracking-[-.035em] leading-none tabular-nums text-ink" style={color ? { color } : undefined}>{value}</div>
      <div className="mt-2 text-mut text-[12px]">{caption}</div>
    </div>
  )
}

/** AI 使用按能力 · 真实计数 → CSS 甜甜圈 + 图例（占比由真实 count 算，不伪造） */
function AiDonut({ items }: { items: AiUsageItem[] }) {
  const total = items.reduce((s, a) => s + a.count, 0)
  if (items.length === 0 || total === 0) {
    return <div className="text-mut text-[13px] py-[14px]">暂无 AI 使用记录。在共创营地跑一次技能（研判 / PPT / 生图…），这里就会开始统计。</div>
  }
  let acc = 0
  const stops = items
    .map((a, i) => {
      const start = (acc / total) * 100
      acc += a.count
      const end = (acc / total) * 100
      return `${DONUT_PALETTE[i % DONUT_PALETTE.length]} ${start}% ${end}%`
    })
    .join(', ')
  return (
    <div className="flex items-center gap-[22px] flex-wrap">
      <div className="w-32 h-32 shrink-0 rounded-full grid place-items-center" style={{ background: `conic-gradient(${stops})` }}>
        <div className="w-[86px] h-[86px] rounded-full bg-[rgba(7,8,12,.9)] grid place-items-center text-center">
          <div>
            <div className="text-[23px] font-bold leading-none">{total}</div>
            <div className="text-[10px] text-mut mt-[3px]">次成果</div>
          </div>
        </div>
      </div>
      <div className="grid gap-[10px] flex-1 min-w-[150px]">
        {items.map((a, i) => (
          <div key={a.capability} className="flex items-center gap-[9px]">
            <span className="w-[10px] h-[10px] rounded-[3px] shrink-0" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
            <div className="flex-1 text-[13px] text-ink-2 truncate">{a.capability}</div>
            <span className="text-[12.5px] font-bold text-ink-2">{a.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 管理驾驶舱：跨项目只读聚合，接真实后端（C5）。 */
export default function BossPage() {
  const [dash, setDash] = useState<BossDashboard | null>(null)
  const [workload, setWorkload] = useState<WorkloadItem[]>([])
  const [aiUsage, setAiUsage] = useState<AiUsageItem[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [feishuOk, setFeishuOk] = useState(false)
  const [commentsOk, setCommentsOk] = useState(false)
  const [bcText, setBcText] = useState('')
  const [bcAll, setBcAll] = useState(false) // 通知历史:首屏只显最近 3 条,其余点开
  const bcRef = useRef<HTMLInputElement>(null) // KPI 带「发全员通知」滚动聚焦落点

  // 口令门禁(P1-6):本机口令防同屏误入;解锁凭据只记本次会话(sessionStorage)。
  const [gate, setGate] = useState<'checking' | 'setup' | 'locked' | 'open'>('checking')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [gateErr, setGateErr] = useState<string | null>(null)

  useEffect(() => {
    api.adminStatus()
      .then((s) => {
        if (!s.configured) { sessionStorage.removeItem('romai_admin_ok'); setGate('setup') }
        else if (sessionStorage.getItem('romai_admin_ok') === '1') setGate('open')
        else setGate('locked')
      })
      .catch(() => setGate('locked'))
  }, [])

  const doSetup = async () => {
    setGateErr(null)
    if (pw.trim().length < 4) { setGateErr('口令至少 4 位'); return }
    if (pw !== pw2) { setGateErr('两次输入不一致'); return }
    try {
      await api.adminSetup(pw.trim())
      sessionStorage.setItem('romai_admin_ok', '1')
      setPw(''); setPw2(''); setGate('open')
    } catch (e) { setGateErr((e as Error).message) }
  }
  const doLogin = async () => {
    setGateErr(null)
    try {
      await api.adminLogin(pw)
      sessionStorage.setItem('romai_admin_ok', '1')
      setPw(''); setGate('open')
    } catch (e) { setGateErr((e as Error).message) }
  }
  const doLock = () => { sessionStorage.removeItem('romai_admin_ok'); setPw(''); setGate('locked') }

  const loadBroadcasts = useCallback(() => {
    api.listBroadcasts().then(setBroadcasts).catch(() => setBroadcasts([]))
  }, [])

  useEffect(() => {
    if (gate !== 'open') return
    api.getBossDashboard().then(setDash).catch(() => setDash(null))
    api.getWorkload().then(setWorkload).catch(() => setWorkload([]))
    api.getAiUsage().then(setAiUsage).catch(() => setAiUsage([]))
    api.getFeishuBoard().then((r) => setFeishuOk(r.status === 'ok')).catch(() => setFeishuOk(false))
    api.getBossComments().then((r) => setCommentsOk(r.status === 'ok')).catch(() => setCommentsOk(false))
    loadBroadcasts()
  }, [gate, loadBroadcasts])

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

  const gateInput = (v: string, set: (s: string) => void, ph: string, onEnter: () => void) => (
    <input type="password" value={v} placeholder={ph} autoComplete="off"
      onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter() }}
      className="w-full py-[10px] px-[13px] border border-solid border-line rounded-[10px] bg-[rgba(255,255,255,.045)] text-ink text-[14px] [font-family:inherit] outline-none mb-[10px]" />
  )

  // 未解锁:口令门禁(首次设置 / 输入口令)。数据在解锁前不拉取。
  if (gate !== 'open') {
    return (
      <div className="text-ink relative grid place-items-center min-h-[58vh]">
        <BoardBackdrop mode="aurora" />
        {gate === 'checking' ? (
          <div className="text-mut text-[13px] relative z-[1]">正在检查权限…</div>
        ) : (
          <div className="ckcard w-[min(380px,92vw)] pt-[26px] px-[26px] pb-5 relative z-[1]" style={{ ['--ac']: '#d7a86e', ['--gl']: 'rgba(215,168,110,.24)' } as React.CSSProperties}>
            <div className="flex items-center gap-[10px] mb-[6px]">
              <span className="w-[38px] h-[38px] rounded-[12px] bg-brand-gold/[.12] border border-solid border-brand-gold/[.33] text-brand-gold grid place-items-center"><Lock size={17} /></span>
              <div>
                <div className="text-[16px] font-bold text-white">{gate === 'setup' ? '设置管理口令' : '管理驾驶舱已锁定'}</div>
                <div className="text-[11.5px] text-mut mt-[2px]">{gate === 'setup' ? '首次使用,先设一个管理口令' : '输入管理口令进入'}</div>
              </div>
            </div>
            <div className="mt-[14px]">
              {gateInput(pw, setPw, gate === 'setup' ? '设置口令(至少 4 位)' : '管理口令', gate === 'setup' ? doSetup : doLogin)}
              {gate === 'setup' && gateInput(pw2, setPw2, '再输一遍确认', doSetup)}
              <button type="button" onClick={gate === 'setup' ? doSetup : doLogin} className={`w-full ${gradBtn}`}>
                {gate === 'setup' ? '设置并进入' : '解锁'}
              </button>
              {gateErr && <div className="text-[12px] mt-2" style={{ color: '#ff9b9b' }}>{gateErr}</div>}
              <div className="text-mut-2 text-[11px] mt-3 leading-[1.6]">本机口令,防同屏他人误入;口令仅以加盐哈希存本机,不上传。</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="text-ink">
      {/* HERO 区:板块动态背景(aurora 静场呼吸)只罩 头部+KPI 带(数字主角,背景安静) */}
      <section className="relative">
        <BoardBackdrop mode="aurora" />
        <div className="relative z-[1]">
      {/* header */}
      <header className="flex items-start justify-between gap-[18px] flex-wrap mb-[22px]">
        <div>
          <div className="flex items-center gap-[10px] flex-wrap">
            <h1 className="m-0 text-[32px] font-semibold tracking-[-.025em]">管理驾驶舱</h1>
            <span className="text-[11.5px] text-brand-gold border border-solid border-brand-gold/[.33] bg-brand-gold/[.1] rounded-[99px] py-1 px-[10px] inline-flex items-center gap-[5px]"><Lock size={11} /> 仅管理员可见</span>
          </div>
          <p className="m-0 mt-2 text-mut text-[13px]">面向负责人的跨项目只读聚合 —— 进行中项目、交付节点、风险与 AI 产能一屏掌握。</p>
        </div>
        <button type="button" onClick={doLock} title="锁定驾驶舱(下次进入需再输口令)"
          className="[font-family:inherit] cursor-pointer inline-flex items-center gap-[6px] h-[34px] py-0 px-[13px] rounded-[10px] border border-solid border-line bg-white/[.04] text-ink-2 text-[12.5px]">
          <Lock size={12} /> 锁定
        </button>
      </header>

      {/* 签名 KPI 带:本页唯一 gshell —— 一条大数字仪表带(数字是主角,背景安静) */}
      <section className="gshell mb-5">
        <div className="gshell-in py-5 px-[10px] flex items-stretch flex-wrap gap-y-[18px]">
          <HeroKpi first label="进行中项目" value={dash ? <CountNum n={dash.active_projects} /> : '—'} caption="跨项目聚合" />
          <HeroKpi label="临近交付" value={dash ? <CountNum n={dash.near_delivery} /> : '—'} caption="14 天内到节点" color={C.amber} />
          <HeroKpi label="高风险项" value={dash ? <CountNum n={dash.high_risks} /> : '—'} caption="需负责人介入" color={C.red} />
          <HeroKpi label="AI 使用 · 本周" value={dash ? <CountNum n={dash.ai_usage_week} /> : '—'} caption="次成果生成" />
          <button type="button" onClick={() => { bcRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => bcRef.current?.focus(), 350) }}
            className="ml-auto self-center mr-[14px] shrink-0 inline-flex items-center gap-[6px] h-9 py-0 px-[15px] rounded-[11px] border border-solid border-line bg-white/[.05] text-ink-2 text-[12.5px] font-semibold [font-family:inherit] cursor-pointer">
            <Megaphone size={13} /> 发全员通知
          </button>
        </div>
      </section>
        </div>
      </section>

      {/* charts row */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[18px] mb-[18px]">
        <div className={`${glassCard} p-5`}>
          <SectionTitle hint="按能力占比">AI 使用情况</SectionTitle>
          <AiDonut items={aiUsage} />
        </div>
        <div className={`${glassCard} p-5`}>
          <SectionTitle hint="本周进行中任务">成员工作量 · 人工 / AI</SectionTitle>
          {workload.length === 0 ? (
            <div className="text-mut text-[13px] py-[14px]">暂无工作量数据。到「协作平台」录入团队成员，纪要待办和任务分派会自动计入负荷。</div>
          ) : (
            <div className="grid gap-[14px]">
              {workload.map((w) => {
                const lv = LEVEL[w.level] ?? LEVEL.medium
                return (
                  <div key={w.name} className="grid grid-cols-[76px_1fr_48px] gap-3 items-center">
                    <span className="text-[13px] text-ink-2 truncate">{w.name}</span>
                    <div className="h-[9px] rounded-[6px] bg-white/[.06] overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.max(4, Math.min(100, w.pct))}%`, background: lv.grad }} />
                    </div>
                    <span className="text-[12px] font-bold text-right" style={{ color: lv.color }}>{LEVEL_LABEL[w.level] ?? w.level}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* broadcast */}
      <section className={`${glassCard} p-5 mb-[18px]`}>
        <SectionTitle hint="出现在所有员工的「项目员工」信息带">发全员通知</SectionTitle>
        <div className="flex gap-[10px] items-center">
          <input
            ref={bcRef}
            placeholder="输入要广播给全员的通知，例如：本周五下午 3 点市庄项目阶段评审，请相关同事预留时间"
            value={bcText}
            onChange={(e) => setBcText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && publish()}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,92,255,.55)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = C.line }}
            className="flex-1 border border-solid border-line bg-[rgba(255,255,255,.045)] rounded-[12px] py-[11px] px-[14px] text-[13.5px] [font-family:inherit] text-ink outline-none"
          />
          <button type="button" onClick={publish} className={`${gradBtn} shadow-[0_0_36px_rgba(124,92,255,.24)]`}>
            发布
          </button>
        </div>
        <div className="mt-3">
          {broadcasts.length === 0 && <div className="text-[12.5px] text-mut py-[7px]">暂无已发布通知。</div>}
          {(bcAll ? broadcasts : broadcasts.slice(0, 3)).map((b) => (
            <div key={b.id} className="flex items-center gap-[9px] text-[12.5px] text-ink-2 py-[9px] border-t border-solid border-line">
              <span className="inline-flex"><Megaphone size={13} /></span>
              <span className="flex-1">{b.text}</span>
              <span className="text-[10.5px] text-mut">{b.created_at.slice(0, 10)}</span>
            </div>
          ))}
          {broadcasts.length > 3 && (
            <button type="button" onClick={() => setBcAll((v) => !v)} className="bg-transparent border-0 pt-[9px] px-0 pb-0 text-mut text-[12px] [font-family:inherit] cursor-pointer">
              {bcAll ? '收起 ▴' : `查看全部 ${broadcasts.length} 条 ▾`}
            </button>
          )}
        </div>
      </section>

      {/* 飞书能力未接入:收成一行,不再占两张卡(首屏减负;真接入后再升卡) */}
      {!(feishuOk && commentsOk) && (
        <div className="flex items-center gap-2 mt-1 text-mut-2 text-[12px]">
          <span className="w-[7px] h-[7px] rounded-full bg-mut-2 shrink-0" />
          飞书项目看板 · 项目评论 —— 即将接入
        </div>
      )}
    </div>
  )
}

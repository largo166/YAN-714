import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'
import { CountNum } from '@/lib/useCountUp'
import type { AiUsageItem, BossDashboard, Broadcast, WorkloadItem } from '@/types/schemas'

/* 管理驾驶舱 · 暗色重写（吸取 DC 暗色霓虹 / 图标卡片 / 数据可视化）。
   红线：只渲染真实后端聚合数据（dash/workload/aiUsage/broadcasts）；
   DC 原型里的假图表（健康度 86 / 按期率 / 中标率 / 风险项目表）一律不编，缺数据走空态。
   飞书看板 / 项目评论无真实集成 → not_configured 占位，绝不伪造。 */

const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d', green: '#49d18d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674',
  line: 'rgba(255,255,255,.08)',
  glass: 'linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.032))',
}
const DONUT_PALETTE = [C.purple, C.blue, C.cyan, C.gold, C.amber, C.red, C.green]

const LEVEL_LABEL: Record<string, string> = { high: '偏高', medium: '适中', low: '较轻' }
const LEVEL: Record<string, { color: string; grad: string }> = {
  high: { color: '#ff8f93', grad: 'linear-gradient(90deg,#ff5e66,#fdab3d)' },
  medium: { color: '#d8d4cc', grad: 'linear-gradient(90deg,#42a5ff,#7c5cff)' },
  low: { color: '#49d18d', grad: 'linear-gradient(90deg,#49d18d,#36e6d4)' },
}

const cardBase: React.CSSProperties = { border: `1px solid ${C.line}`, borderRadius: 22, background: C.glass }

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff' }}>{children}</h2>
      {hint && <span style={{ fontSize: 12, color: C.mut }}>{hint}</span>}
    </div>
  )
}

function Kpi({ label, value, caption, color, ac, gl }: { label: string; value: React.ReactNode; caption: string; color?: string; ac: string; gl: string }) {
  return (
    <div className="ckcard" style={{ padding: 18, minHeight: 128, ['--ac']: ac, ['--gl']: gl } as React.CSSProperties}>
      <div style={{ color: C.mut, fontSize: 12.5 }}>{label}</div>
      <div style={{ marginTop: 16, fontSize: 36, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: color || C.ink }}>{value}</div>
      <div style={{ marginTop: 10, color: C.mut, fontSize: 12, lineHeight: 1.5 }}>{caption}</div>
    </div>
  )
}

/** AI 使用按能力 · 真实计数 → CSS 甜甜圈 + 图例（占比由真实 count 算，不伪造） */
function AiDonut({ items }: { items: AiUsageItem[] }) {
  const total = items.reduce((s, a) => s + a.count, 0)
  if (items.length === 0 || total === 0) {
    return <div style={{ color: C.mut, fontSize: 13, padding: '14px 0' }}>暂无 AI 使用记录。</div>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
      <div style={{ width: 128, height: 128, flexShrink: 0, borderRadius: '50%', background: `conic-gradient(${stops})`, display: 'grid', placeItems: 'center' }}>
        <div style={{ width: 86, height: 86, borderRadius: '50%', background: '#0a0c12', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 10, color: C.mut, marginTop: 3 }}>次成果</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10, flex: 1, minWidth: 150 }}>
        {items.map((a, i) => (
          <div key={a.capability} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
            <div style={{ flex: 1, fontSize: 13, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.capability}</div>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink2 }}>{a.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 飞书未接入占位（三态红线：不伪造数据） */
function NotConfigured({ title, tag, hint }: { title: string; tag: string; hint: string }) {
  return (
    <div style={{ ...cardBase, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>{title}</h2>
        <span style={{ fontSize: 10.5, color: C.gold, border: `1px solid ${C.gold}55`, background: `${C.gold}1a`, borderRadius: 7, padding: '2px 8px' }}>{tag}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', color: C.mut, fontSize: 13, lineHeight: 1.6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: C.mut2 }} />
        {hint}
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
    <div style={{ color: C.ink, fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif", letterSpacing: '-.01em' }}>
      {/* header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-.03em' }}>管理驾驶舱</h1>
            <span style={{ fontSize: 11.5, color: C.gold, border: `1px solid ${C.gold}55`, background: `${C.gold}1a`, borderRadius: 99, padding: '4px 10px' }}>🔒 仅管理员可见</span>
          </div>
          <p style={{ margin: '8px 0 0', color: C.mut, fontSize: 13 }}>面向负责人的跨项目只读聚合 —— 进行中项目、交付节点、风险与 AI 产能一屏掌握。</p>
        </div>
      </header>

      {/* KPI row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
        <Kpi label="进行中项目" value={dash ? <CountNum n={dash.active_projects} /> : '—'} caption="跨项目聚合" color={C.ink} ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.30)" />
        <Kpi label="临近交付" value={dash ? <CountNum n={dash.near_delivery} /> : '—'} caption="14 天内到节点" color={C.amber} ac="#fdab3d" gl="rgba(215,168,110,.30)" />
        <Kpi label="高风险项" value={dash ? <CountNum n={dash.high_risks} /> : '—'} caption="需负责人介入" color={C.red} ac="#ff5e66" gl="rgba(255,94,102,.28)" />
        <Kpi label="AI 使用 · 本周" value={dash ? <CountNum n={dash.ai_usage_week} /> : '—'} caption="次成果生成" ac="linear-gradient(90deg,#7c5cff,#42a5ff)" gl="rgba(124,92,255,.24)" />
      </section>

      {/* charts row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18, marginBottom: 18 }}>
        <div style={{ ...cardBase, padding: 20 }}>
          <SectionTitle hint="按能力占比">AI 使用情况</SectionTitle>
          <AiDonut items={aiUsage} />
        </div>
        <div style={{ ...cardBase, padding: 20 }}>
          <SectionTitle hint="本周进行中任务">成员工作量 · 人工 / AI</SectionTitle>
          {workload.length === 0 ? (
            <div style={{ color: C.mut, fontSize: 13, padding: '14px 0' }}>暂无工作量数据。</div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {workload.map((w) => {
                const lv = LEVEL[w.level] ?? LEVEL.medium
                return (
                  <div key={w.name} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 48px', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: C.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
                    <div style={{ height: 9, borderRadius: 6, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(4, Math.min(100, w.pct))}%`, background: lv.grad }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: lv.color, textAlign: 'right' }}>{LEVEL_LABEL[w.level] ?? w.level}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* broadcast */}
      <section style={{ ...cardBase, padding: 20, marginBottom: 18 }}>
        <SectionTitle hint="出现在所有员工的「项目员工」信息带">发全员通知</SectionTitle>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            placeholder="输入要广播给全员的通知，例如：本周五下午 3 点市庄项目阶段评审，请相关同事预留时间"
            value={bcText}
            onChange={(e) => setBcText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && publish()}
            style={{ flex: 1, border: `1px solid ${C.line}`, background: 'rgba(255,255,255,.045)', borderRadius: 12, padding: '11px 14px', fontSize: 13.5, fontFamily: 'inherit', color: C.ink, outline: 'none' }}
          />
          <button
            type="button"
            onClick={publish}
            style={{ height: 42, padding: '0 18px', border: 0, borderRadius: 12, background: 'linear-gradient(135deg,#7c5cff,#42a5ff)', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', boxShadow: '0 0 36px rgba(124,92,255,.24)' }}
          >
            发布
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          {broadcasts.length === 0 && <div style={{ fontSize: 12.5, color: C.mut, padding: '7px 0' }}>暂无已发布通知。</div>}
          {broadcasts.map((b) => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: C.ink2, padding: '9px 0', borderTop: `1px solid ${C.line}` }}>
              <span>📢</span>
              <span style={{ flex: 1 }}>{b.text}</span>
              <span style={{ fontSize: 10.5, color: C.mut }}>{b.created_at.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* feishu placeholders — 三态红线 */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 18 }}>
        <NotConfigured
          title="飞书项目看板 · 合同进度"
          tag="飞书同步"
          hint={feishuOk ? '（飞书看板数据）' : '飞书未接入。配置飞书集成后在此显示合同进度与收款节点（当前不显示模拟数据）。'}
        />
        <NotConfigured
          title="项目评论 · 通知到成员"
          tag="飞书消息"
          hint={commentsOk ? '（项目评论数据）' : '飞书未接入。配置后可对项目写评论并通过飞书通知成员（当前不显示模拟评论）。'}
        />
      </section>
    </div>
  )
}

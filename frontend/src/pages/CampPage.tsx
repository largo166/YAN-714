import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import RichText from '@/components/RichText'
import type { Skill, SkillRun } from '@/types/schemas'

/* 共创营地 · 暗色重写（Phase 2）。
   视觉对齐 DC 暗色霓虹；数据由 /api/skills 驱动；执行接真 runSkill。
   Phase 2：4 入口→子技能展开 + 方案评审「快速评审/设计委员会(MoA)」模式选择 + MoA 暗色渲染。
   未做（Phase 3+）：富对话追问、对话流历史、退役 AgentPage。 */

const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674',
  line: 'rgba(255,255,255,.08)', glass: 'linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.028))',
}
const CAT_ORDER = ['概念与方案', '竞品与研究', '文本与汇报', '出图与表现', '审查与合规']

// 4 个 ASK 入口 → 各自子技能（点入口先展开，不直接跑）
const ENTRIES: Record<string, { title: string; subs: string[] }> = {
  concept: { title: '概念激发', subs: ['concept', 'massing', 'compare', 'facade'] },
  review: { title: '方案评审', subs: ['review', 'compete', 'caselib', 'condition'] },
  flow: { title: '定义工作流', subs: ['task', 'review', 'judge', 'norm'] },
  brief: { title: '汇报提纲', subs: ['brief', 'writer', 'poster', 'slang'] },
}
const ENTRY_IDS = ['concept', 'review', 'flow', 'brief']
// 子技能 → 实际跑的底层技能（不新增空壳）
const RUN_AS: Record<string, string> = { brief: 'ppt', judge: 'task' }

const AGENTS = [
  { sid: 'concept', av: '领', avc: C.purple, title: '方案领航员', sub: '从任务书引导到体量概念' },
  { sid: 'compete', av: '标', avc: C.blue, title: '对标研究员', sub: '自动抓取同类竞品与策略' },
  { sid: 'writer', av: '文', avc: C.gold, title: '文本起草官', sub: '生成投标文本与汇报材料' },
  { sid: 'judge', av: '督', avc: C.red, title: '节点督办官', sub: '盯紧里程碑与逾期风险' },
]

function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.34, flexShrink: 0, position: 'relative', background: 'radial-gradient(circle at 32% 28%,#fff,#c8bcff 30%,#7c5cff 56%,#42a5ff 82%)', boxShadow: '0 0 38px rgba(124,92,255,.45)' }}>
      <div style={{ position: 'absolute', inset: size * 0.3, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.5)' }} />
    </div>
  )
}

function Card({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button type="button" onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink, border: '1px solid ' + (hov ? 'rgba(124,92,255,.5)' : C.line), borderRadius: 18, padding: '15px 16px', background: C.glass, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 104, transform: hov ? 'translateY(-3px)' : 'none', boxShadow: hov ? '0 16px 40px rgba(0,0,0,.34)' : 'none', transition: 'all .16s' }}>
      {children}
    </button>
  )
}

// 暗色 MoA「设计委员会」结果渲染（总分/风险/通过率 + 设计亮点 + 检查清单 + 跨维度问题 + 下一步）
function MoaDark({ cl }: { cl: Record<string, unknown> }) {
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
  const score = num(cl.overall_score)
  const pass = num(cl.pass_rate)
  const risk = String(cl.risk_level || '—')
  const riskColor = risk === 'high' ? C.red : risk === 'medium' ? C.amber : risk === 'low' ? C.cyan : C.mut
  const arr = (k: string) => (Array.isArray(cl[k]) ? (cl[k] as Record<string, unknown>[]) : [])
  const cats = arr('categories'), conflicts = (arr('cross_cutting_issues').length ? arr('cross_cutting_issues') : arr('conflict_items'))
  const highlights = arr('highlights'), steps = Array.isArray(cl.next_steps) ? (cl.next_steps as string[]) : []
  const metric = (label: string, value: string, color?: string) => (
    <div style={{ minWidth: 84 }}><div style={{ fontSize: 11, color: C.mut }}>{label}</div><div style={{ fontSize: 22, fontWeight: 700, color: color || C.ink }}>{value}</div></div>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginBottom: 6 }}>
        {metric('总分', score != null ? String(score) : '—', score == null ? C.mut : score >= 80 ? C.cyan : score >= 60 ? C.amber : C.red)}
        {metric('风险', risk === 'high' ? '高' : risk === 'medium' ? '中' : risk === 'low' ? '低' : risk, riskColor)}
        {metric('通过率', pass != null ? `${Math.round(pass * 100)}%` : '—')}
      </div>
      {typeof cl.one_sentence_review === 'string' && (
        <div style={{ fontSize: 13, fontWeight: 600, borderLeft: '3px solid ' + C.purple, paddingLeft: 10, margin: '10px 0' }}>{cl.one_sentence_review as string}</div>
      )}
      {highlights.length > 0 && (
        <div style={{ marginTop: 12 }}><b style={{ color: C.cyan, fontSize: 13 }}>✦ 设计亮点</b>
          {highlights.map((h, i) => <div key={i} style={{ fontSize: 12.5, marginTop: 3, color: C.ink2 }}><b style={{ color: C.ink }}>{String(h.aspect || '')}</b>{h.note ? `：${String(h.note)}` : ''}</div>)}
        </div>
      )}
      {cats.length > 0 && (
        <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>评图清单</b>
          {cats.map((cat, ci) => (
            <div key={ci} style={{ marginTop: 8, border: '1px solid ' + C.line, borderRadius: 10, padding: '8px 10px', background: 'rgba(255,255,255,.03)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff' }}>{String(cat.label || cat.category || '')}</div>
              {(Array.isArray(cat.items) ? (cat.items as Record<string, unknown>[]) : []).map((it, ii) => (
                <div key={ii} style={{ fontSize: 12, marginTop: 5, color: C.ink2 }}>
                  <span style={{ color: '#fff', background: it.pass ? C.cyan : C.red, borderRadius: 4, padding: '1px 6px', fontSize: 10.5, marginRight: 6 }}>{it.pass ? '通过' : '不通过'}</span>
                  <b style={{ color: C.ink }}>{String(it.item || '')}</b>{it.note ? `：${String(it.note)}` : ''}
                  {!it.pass && Boolean(it.design_impact || it.suggested_action) && (
                    <div style={{ color: C.mut, marginTop: 2, marginLeft: 4 }}>{it.design_impact ? `影响：${String(it.design_impact)}　` : ''}{it.suggested_action ? `建议：${String(it.suggested_action)}` : ''}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {conflicts.length > 0 && (
        <div style={{ marginTop: 12 }}><b style={{ fontSize: 13, color: C.amber }}>⚔ 跨维度问题</b>
          {conflicts.map((c, i) => (
            <div key={i} style={{ marginTop: 6, border: '1px solid rgba(253,171,61,.3)', background: 'rgba(253,171,61,.06)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: C.ink2 }}>
              <div style={{ fontWeight: 600, color: C.ink }}>{String(c.issue || '')}</div>
              {([['concept_view', '概念'], ['spatial_view', '空间'], ['form_view', '形式'], ['function_view', '功能'], ['cost_view', '成本']] as [string, string][])
                .filter(([k]) => c[k]).map(([k, lab], j) => <div key={j} style={{ marginTop: 3 }}>· {lab}视角：{String(c[k])}</div>)}
              {c.resolution ? <div style={{ marginTop: 3, color: C.ink }}>↳ 整合建议：{String(c.resolution)}</div> : null}
            </div>
          ))}
        </div>
      )}
      {steps.length > 0 && (
        <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>下一步建议</b>
          {steps.map((s, i) => <div key={i} style={{ fontSize: 12.5, marginTop: 3, color: C.ink2 }}>{i + 1}. {s}</div>)}
        </div>
      )}
    </div>
  )
}

export default function CampPage() {
  const { cur } = useProject()
  const [skills, setSkills] = useState<Skill[]>([])
  const [tab, setTab] = useState<'ask' | 'agents'>('ask')
  const [view, setView] = useState<'hero' | 'entry' | 'skills' | 'run'>('hero')
  const [entry, setEntry] = useState<string>('')          // 当前展开的入口
  const [text, setText] = useState('')
  const [active, setActive] = useState<Skill | null>(null)
  const [result, setResult] = useState<SkillRun | null>(null)
  const [moaMode, setMoaMode] = useState(false)
  const [picker, setPicker] = useState(false)             // 方案评审「快速/设计委员会」选择
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { api.listSkills().then((d) => setSkills(d.items)).catch(() => setSkills([])) }, [])

  const byId = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])) as Record<string, Skill>, [skills])
  const cats = useMemo(() => {
    const m = new Map<string, Skill[]>()
    for (const s of skills) { const k = s.category || '其它'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s) }
    return [...m.entries()].sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0]))
  }, [skills])

  const run = useCallback(async (skillId: string, mode = '') => {
    const realId = RUN_AS[skillId] || skillId
    setActive(byId[skillId] || byId[realId] || null)
    setView('run'); setResult(null); setErr(''); setMoaMode(mode === 'moa'); setPicker(false)
    if (!cur) { setErr('请先在顶部选择作用项目，再共创。'); return }
    setBusy(true)
    try {
      setResult(await api.runSkill(cur.id, realId, text.trim(), '', 0, '', '', mode))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [cur, text, byId])

  // 子技能点击：方案评审 → 弹模式选择;其余直接跑
  const handleSub = (skillId: string) => { if (skillId === 'review') setPicker(true); else run(skillId) }

  const composer = (big: boolean) => (
    <div style={{ padding: 2, borderRadius: 22, background: 'linear-gradient(120deg,rgba(124,92,255,.85),rgba(66,165,255,.6) 42%,rgba(215,168,110,.7))', boxShadow: '0 0 50px rgba(124,92,255,.22)' }}>
      <div style={{ borderRadius: 20, background: 'rgba(8,10,16,.92)', padding: '14px 16px 12px', minHeight: big ? 132 : 'auto', display: 'flex', flexDirection: 'column' }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'agents' ? '描述拖慢团队的重复工作，让智能体接管…' : '从一个想法到一套方案，把要共创的事告诉我…'} rows={big ? 3 : 2}
          style={{ flex: big ? 1 : 'none', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: C.ink, fontSize: 15, fontFamily: 'inherit', padding: 0, marginBottom: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" title="打开技能库" onClick={() => setView('skills')} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: C.ink2, fontSize: 17, cursor: 'pointer' }}>+</button>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: C.ink2, fontSize: 13 }}><BrandMark size={15} /> ROM Max ▾</span>
        </div>
      </div>
    </div>
  )

  const hero = () => {
    const isAgents = tab === 'agents'
    const tabBtn = (key: 'ask' | 'agents', label: string, icon: string) => (
      <button type="button" onClick={() => setTab(key)} style={{ fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px 11px', fontSize: 14, fontWeight: 700, border: 'none', color: tab === key ? '#fff' : C.mut, background: tab === key ? 'linear-gradient(180deg,rgba(124,92,255,.26),rgba(124,92,255,.04))' : 'transparent', borderRadius: '14px 14px 0 0', borderBottom: tab === key ? '2px solid ' + C.purple : '2px solid transparent' }}>{icon} {label}</button>
    )
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 30 }}>
            <BrandMark size={46} />
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-.04em', background: 'linear-gradient(95deg,#fff 20%,#c8bcff 60%,#80c9ff 92%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{isAgents ? '设计智能体' : '共创营地'}</div>
              <sup style={{ fontSize: 15, color: C.mut, marginTop: 4, marginLeft: 4 }}>{isAgents ? 'Agents' : '²'}</sup>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>{tabBtn('ask', '对话共创', '✦')}{tabBtn('agents', '设计智能体', '◎')}</div>
          {composer(true)}
          <div style={{ textAlign: 'center', color: C.mut2, fontSize: 12.5, margin: '16px 0 26px' }}>{isAgents ? '选一个智能体，或直接描述任务 — 它会带着你的项目上下文执行。' : '挑一个入口展开子技能，或直接开口 — 我会带着你的项目上下文一起想。'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(166px,1fr))', gap: 12 }}>
            {isAgents
              ? AGENTS.map((a) => (
                  <Card key={a.sid} onClick={() => byId[a.sid] && run(a.sid)}>
                    <div style={{ width: 34, height: 34, borderRadius: 11, background: a.avc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, boxShadow: `0 0 22px ${a.avc}66` }}>{a.av}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{a.title}</div><div style={{ fontSize: 12, color: C.mut, marginTop: 4, lineHeight: 1.4 }}>{a.sub}</div></div>
                  </Card>
                ))
              : ENTRY_IDS.map((id) => {
                  const s = byId[id]
                  return (
                    <Card key={id} onClick={() => { setEntry(id); setView('entry') }}>
                      <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: C.ink2, display: 'grid', placeItems: 'center', fontSize: 16 }}>{s?.icon || '✦'}</div>
                      <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{ENTRIES[id].title}</div><div style={{ fontSize: 12, color: C.mut, marginTop: 4, lineHeight: 1.4 }}>{ENTRIES[id].subs.length} 个子技能 · 点击展开</div></div>
                    </Card>
                  )
                })}
          </div>
          <button type="button" onClick={() => setView('skills')} style={{ marginTop: 16, width: '100%', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 44, borderRadius: 14, border: '1px dashed rgba(255,255,255,.16)', background: 'rgba(255,255,255,.025)', color: '#b9bdcc', fontSize: 13.5, fontWeight: 600 }}>▤ 浏览全部技能 <span style={{ color: C.purple }}>→</span></button>
        </div>
      </div>
    )
  }

  // 入口展开 → 子技能
  const entryView = () => {
    const e = ENTRIES[entry]
    if (!e) return hero()
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 640 }}>
          <button type="button" onClick={() => setView('hero')} style={{ fontFamily: 'inherit', cursor: 'pointer', height: 32, padding: '0 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: C.ink2, fontSize: 13, marginBottom: 18 }}>← 返回营地</button>
          <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{e.title}</div>
          <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 18 }}>选一个子技能，点击即真实调用后端。</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            {e.subs.map((sid, i) => {
              const s = byId[sid]
              if (!s) return null
              const isReview = sid === 'review'
              return (
                <Card key={sid + i} onClick={() => handleSub(sid)}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: (s.color || C.purple) + '22', border: '1px solid ' + (s.color || C.purple) + '55', color: s.color || C.purple, display: 'grid', placeItems: 'center', fontSize: 16 }}>{s.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.title}{isReview && <span style={{ fontSize: 10.5, color: C.purple, marginLeft: 6 }}>✦ 可设计委员会</span>}</div>
                      <div style={{ fontSize: 12, color: C.mut, marginTop: 3, lineHeight: 1.45 }}>{s.source}</div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const skillsView = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '22px 30px 14px' }}>
        <BrandMark size={30} />
        <div style={{ flex: 1 }}><div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>技能库</div><div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>共 {skills.length} 个技能 · 选一个进入共创</div></div>
        <button type="button" onClick={() => setView('hero')} style={{ fontFamily: 'inherit', cursor: 'pointer', height: 34, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: C.ink2, fontSize: 13 }}>✕ 关闭</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 30px 40px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 26 }}>
          {cats.map(([cat, list]) => (
            <div key={cat}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: list[0]?.color || C.purple, boxShadow: '0 0 12px ' + (list[0]?.color || C.purple) }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{cat}</div>
                <div style={{ fontSize: 12, color: C.mut, background: 'rgba(255,255,255,.04)', border: '1px solid ' + C.line, borderRadius: 99, padding: '1px 9px' }}>{list.length}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
                {list.map((s) => (
                  <Card key={s.id} onClick={() => handleSub(s.id)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: (s.color || C.purple) + '22', border: '1px solid ' + (s.color || C.purple) + '55', color: s.color || C.purple, display: 'grid', placeItems: 'center', fontSize: 16 }}>{s.icon}</div>
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.title}</div><div style={{ fontSize: 12, color: C.mut, marginTop: 3, lineHeight: 1.45 }}>{s.source}</div></div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const runView = () => {
    let moaChecklist: Record<string, unknown> | null = null
    if (moaMode && result?.status === 'ok' && result.output_json) {
      try { const d = JSON.parse(result.output_json); moaChecklist = (d && d.checklist) || null } catch { moaChecklist = null }
    }
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', borderBottom: '1px solid ' + C.line, background: 'rgba(3,4,6,.4)' }}>
          <button type="button" onClick={() => setView(entry ? 'entry' : 'hero')} style={{ fontFamily: 'inherit', cursor: 'pointer', height: 34, padding: '0 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: C.ink2, fontSize: 13 }}>← 返回</button>
          <BrandMark size={22} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>{active?.title || '共创'}{moaMode && <span style={{ fontSize: 11, color: C.purple, marginLeft: 8 }}>· 设计委员会</span>}</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 26 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', color: C.ink2, fontSize: 14, lineHeight: 1.7 }}>
            {busy && <div style={{ color: C.cyan }}>⏳ {moaMode ? '正在召集设计委员会（三位评图人 + 主审，约 15–60 秒）…' : `正在共创「${active?.title}」…`}</div>}
            {!busy && err && <div style={{ color: C.red }}>执行失败：{err}<button type="button" onClick={() => active && run(active.id, moaMode ? 'moa' : '')} style={{ marginLeft: 10, cursor: 'pointer', background: 'transparent', border: '1px solid ' + C.line, color: C.ink2, borderRadius: 8, padding: '2px 10px' }}>重试</button></div>}
            {!busy && result && result.status !== 'ok' && (
              <div style={{ color: C.mut }}>
                {result.status === 'not_configured' && '未配置 AI（不伪造）。请在设置中配置后重试。'}
                {result.status === 'no_material' && '本项目暂无可用材料。请先到数据基地上传/索引资料。'}
                {result.status === 'error' && `执行失败：${result.error_message || result.content}`}
              </div>
            )}
            {!busy && result && result.status === 'ok' && (
              moaChecklist ? <MoaDark cl={moaChecklist} />
                : result.image_url && cur ? (
                  <a href={api.projectImageUrl(cur.id, result.image_url)} target="_blank" rel="noreferrer"><img src={api.projectImageUrl(cur.id, result.image_url)} alt={active?.title} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid ' + C.line }} /></a>
                ) : <div style={{ color: C.ink }}><RichText text={result.content} /></div>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: '14px 26px 22px', borderTop: '1px solid ' + C.line, background: 'rgba(3,4,6,.4)' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>{composer(false)}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', position: 'relative', color: C.ink, fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif", letterSpacing: '-.01em', display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 18% -6%, rgba(124,92,255,.28), transparent 31%), radial-gradient(circle at 86% 4%, rgba(66,165,255,.16), transparent 28%), radial-gradient(circle at 64% 108%, rgba(215,168,110,.11), transparent 32%), linear-gradient(180deg, #030406 0%, #07080c 44%, #030406 100%)' }}>
      {view === 'skills' ? skillsView() : view === 'run' ? runView() : view === 'entry' ? entryView() : hero()}

      {/* 方案评审 · 模式选择 */}
      {picker && (
        <div onClick={() => setPicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px,92vw)', borderRadius: 20, border: '1px solid ' + C.line, background: 'linear-gradient(160deg,#0c0e16,#07080c)', padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>方案评审 · 选模式</div>
            <div style={{ fontSize: 12, color: C.mut, marginBottom: 16 }}>同一份项目认知，两种评图方式。</div>
            <button type="button" onClick={() => run('review', '')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink, border: '1px solid ' + C.line, borderRadius: 14, padding: '14px 16px', background: C.glass, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>🔥 快速评审</div><div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>单模型，约 3 秒。对话式评审意见。</div>
            </button>
            <button type="button" onClick={() => run('review', 'moa')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink, border: '1px solid rgba(124,92,255,.5)', borderRadius: 14, padding: '14px 16px', background: 'linear-gradient(145deg,rgba(124,92,255,.16),rgba(124,92,255,.04))' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>✦ 设计委员会</div><div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>三位评图人（设计总监 / 空间 / 形式）+ 主审整合，约 15–60 秒。出评分 + 检查清单 + 跨维度问题。</div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

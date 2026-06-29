import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import RichText from '@/components/RichText'
import type { Skill, SkillRun } from '@/types/schemas'

/* 共创营地 · 暗色重写（Phase 1：骨架 + HeroView + SkillLibraryView + 最小执行）。
   视觉对齐 DC 设计稿（暗色霓虹）；数据由后端 /api/skills 驱动；执行接真 runSkill。
   未做（Phase 2+）：富对话视图（追问/场景表）、MoA 会诊接入、对话流历史。 */

const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674',
  line: 'rgba(255,255,255,.08)', glass: 'linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.028))',
}
const CAT_ORDER = ['概念与方案', '竞品与研究', '文本与汇报', '出图与表现', '审查与合规']

// 4 个智能体（Phase 1：映射到最贴近的技能执行）
const AGENTS = [
  { sid: 'concept', av: '领', avc: C.purple, title: '方案领航员', sub: '从任务书引导到体量概念' },
  { sid: 'compete', av: '标', avc: C.blue, title: '对标研究员', sub: '自动抓取同类竞品与策略' },
  { sid: 'writer', av: '文', avc: C.gold, title: '文本起草官', sub: '生成投标文本与汇报材料' },
  { sid: 'judge', av: '督', avc: C.red, title: '节点督办官', sub: '盯紧里程碑与逾期风险' },
]
const ASK_IDS = ['concept', 'review', 'flow', 'brief'] // Hero 快捷共创

function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.34, flexShrink: 0, position: 'relative',
      background: 'radial-gradient(circle at 32% 28%,#fff,#c8bcff 30%,#7c5cff 56%,#42a5ff 82%)',
      boxShadow: '0 0 38px rgba(124,92,255,.45)',
    }}>
      <div style={{ position: 'absolute', inset: size * 0.3, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.5)' }} />
    </div>
  )
}

function Card({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink,
        border: '1px solid ' + (hov ? 'rgba(124,92,255,.5)' : C.line), borderRadius: 18, padding: '15px 16px',
        background: C.glass, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 104,
        transform: hov ? 'translateY(-3px)' : 'none', boxShadow: hov ? '0 16px 40px rgba(0,0,0,.34)' : 'none',
        transition: 'all .16s',
      }}
    >
      {children}
    </button>
  )
}

export default function CampPage() {
  const { cur } = useProject()
  const [skills, setSkills] = useState<Skill[]>([])
  const [tab, setTab] = useState<'ask' | 'agents'>('ask')
  const [view, setView] = useState<'hero' | 'skills' | 'run'>('hero')
  const [text, setText] = useState('')
  const [active, setActive] = useState<Skill | null>(null)
  const [result, setResult] = useState<SkillRun | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.listSkills().then((d) => setSkills(d.items)).catch(() => setSkills([]))
  }, [])

  const byId = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills])
  const cats = useMemo(() => {
    const m = new Map<string, Skill[]>()
    for (const s of skills) {
      const k = s.category || '其它'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()].sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0]))
  }, [skills])

  const run = useCallback(async (skill: Skill) => {
    setActive(skill); setView('run'); setResult(null); setErr('')
    if (!cur) { setErr('请先在顶部选择作用项目，再共创。'); return }
    setBusy(true)
    try {
      setResult(await api.runSkill(cur.id, skill.id, text.trim()))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [cur, text])

  // ── composer ──
  const composer = (big: boolean) => (
    <div style={{ padding: 2, borderRadius: 22, background: 'linear-gradient(120deg,rgba(124,92,255,.85),rgba(66,165,255,.6) 42%,rgba(215,168,110,.7))', boxShadow: '0 0 50px rgba(124,92,255,.22)' }}>
      <div style={{ borderRadius: 20, background: 'rgba(8,10,16,.92)', padding: '14px 16px 12px', minHeight: big ? 132 : 'auto', display: 'flex', flexDirection: 'column' }}>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={tab === 'agents' ? '描述拖慢团队的重复工作，让智能体接管…' : '从一个想法到一套方案，把要共创的事告诉我…'}
          rows={big ? 3 : 2}
          style={{ flex: big ? 1 : 'none', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: C.ink, fontSize: 15, fontFamily: 'inherit', padding: 0, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" title="打开技能库" onClick={() => setView('skills')}
            style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: C.ink2, fontSize: 17, cursor: 'pointer' }}>+</button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: C.ink2, fontSize: 13 }}>
              <BrandMark size={15} /> ROM Max ▾
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  // ── HeroView ──
  const hero = () => {
    const isAgents = tab === 'agents'
    const askCards = ASK_IDS.map((id) => byId[id]).filter(Boolean)
    const tabBtn = (key: 'ask' | 'agents', label: string, icon: string) => (
      <button type="button" onClick={() => setTab(key)} style={{
        fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px 11px', fontSize: 14, fontWeight: 700, border: 'none',
        color: tab === key ? '#fff' : C.mut, background: tab === key ? 'linear-gradient(180deg,rgba(124,92,255,.26),rgba(124,92,255,.04))' : 'transparent',
        borderRadius: '14px 14px 0 0', borderBottom: tab === key ? '2px solid ' + C.purple : '2px solid transparent',
      }}>{icon} {label}</button>
    )
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 30 }}>
            <BrandMark size={46} />
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-.04em', background: 'linear-gradient(95deg,#fff 20%,#c8bcff 60%,#80c9ff 92%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                {isAgents ? '设计智能体' : '共创营地'}
              </div>
              <sup style={{ fontSize: 15, color: C.mut, marginTop: 4, marginLeft: 4 }}>{isAgents ? 'Agents' : '²'}</sup>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
            {tabBtn('ask', '对话共创', '✦')}{tabBtn('agents', '设计智能体', '◎')}
          </div>
          {composer(true)}
          <div style={{ textAlign: 'center', color: C.mut2, fontSize: 12.5, margin: '16px 0 26px' }}>
            {isAgents ? '选一个智能体，或直接描述任务 — 它会带着你的项目上下文执行。' : '挑一个快捷共创，或直接开口 — 我会带着你的项目上下文一起想。'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(166px,1fr))', gap: 12 }}>
            {isAgents
              ? AGENTS.map((a) => (
                  <Card key={a.sid} onClick={() => byId[a.sid] && run(byId[a.sid])}>
                    <div style={{ width: 34, height: 34, borderRadius: 11, background: a.avc, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, boxShadow: `0 0 22px ${a.avc}66` }}>{a.av}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{a.title}</div><div style={{ fontSize: 12, color: C.mut, marginTop: 4, lineHeight: 1.4 }}>{a.sub}</div></div>
                  </Card>
                ))
              : askCards.map((s) => (
                  <Card key={s.id} onClick={() => run(s)}>
                    <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: C.ink2, display: 'grid', placeItems: 'center', fontSize: 16 }}>{s.icon}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.title}</div><div style={{ fontSize: 12, color: C.mut, marginTop: 4, lineHeight: 1.4 }}>{s.source}</div></div>
                  </Card>
                ))}
          </div>
          <button type="button" onClick={() => setView('skills')} style={{ marginTop: 16, width: '100%', fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 44, borderRadius: 14, border: '1px dashed rgba(255,255,255,.16)', background: 'rgba(255,255,255,.025)', color: '#b9bdcc', fontSize: 13.5, fontWeight: 600 }}>
            ▤ 浏览全部技能 <span style={{ color: C.purple }}>→</span>
          </button>
        </div>
      </div>
    )
  }

  // ── SkillLibraryView ──
  const skillsView = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '22px 30px 14px' }}>
        <BrandMark size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: C.ink }}>技能库</div>
          <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>共 {skills.length} 个技能 · 选一个进入共创</div>
        </div>
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
                  <Card key={s.id} onClick={() => run(s)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: (s.color || C.purple) + '22', border: '1px solid ' + (s.color || C.purple) + '55', color: s.color || C.purple, display: 'grid', placeItems: 'center', fontSize: 16 }}>{s.icon}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.title}</div>
                        <div style={{ fontSize: 12, color: C.mut, marginTop: 3, lineHeight: 1.45 }}>{s.source}</div>
                      </div>
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

  // ── RunView（最小执行：跑真技能 + 展示结果。富对话留 Phase 2）──
  const runView = () => {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', borderBottom: '1px solid ' + C.line, background: 'rgba(3,4,6,.4)' }}>
          <button type="button" onClick={() => setView('hero')} style={{ fontFamily: 'inherit', cursor: 'pointer', height: 34, padding: '0 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: C.ink2, fontSize: 13 }}>← 返回营地</button>
          <BrandMark size={22} />
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{active?.title || '共创'}</div>
          <span style={{ fontSize: 11, color: C.mut, border: '1px solid ' + C.line, borderRadius: 99, padding: '3px 9px', background: 'rgba(255,255,255,.04)' }}>{active?.category}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 26 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', color: C.ink2, fontSize: 14, lineHeight: 1.7 }}>
            {busy && <div style={{ color: C.cyan }}>⏳ 正在共创「{active?.title}」…（接真实技能执行，约数秒到数十秒）</div>}
            {!busy && err && <div style={{ color: C.red }}>执行失败：{err}（不展示假数据）<button type="button" onClick={() => active && run(active)} style={{ marginLeft: 10, cursor: 'pointer', background: 'transparent', border: '1px solid ' + C.line, color: C.ink2, borderRadius: 8, padding: '2px 10px' }}>重试</button></div>}
            {!busy && result && result.status !== 'ok' && (
              <div style={{ color: C.mut }}>
                {result.status === 'not_configured' && '未配置 AI（不伪造）。请在设置中配置后重试。'}
                {result.status === 'no_material' && '本项目暂无可用材料。请先到数据基地上传/索引资料。'}
                {result.status === 'error' && `执行失败：${result.error_message || result.content}`}
              </div>
            )}
            {!busy && result && result.status === 'ok' && (
              result.image_url && cur ? (
                <a href={api.projectImageUrl(cur.id, result.image_url)} target="_blank" rel="noreferrer">
                  <img src={api.projectImageUrl(cur.id, result.image_url)} alt={active?.title} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid ' + C.line }} />
                </a>
              ) : (
                <div style={{ color: C.ink }}><RichText text={result.content} /></div>
              )
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
    <div style={{
      minHeight: '100%', position: 'relative', color: C.ink,
      fontFamily: "'Space Grotesk','Noto Sans SC',ui-sans-serif,system-ui,'PingFang SC','Microsoft YaHei',sans-serif",
      letterSpacing: '-.01em', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(circle at 18% -6%, rgba(124,92,255,.28), transparent 31%), radial-gradient(circle at 86% 4%, rgba(66,165,255,.16), transparent 28%), radial-gradient(circle at 64% 108%, rgba(215,168,110,.11), transparent 32%), linear-gradient(180deg, #030406 0%, #07080c 44%, #030406 100%)',
    }}>
      {view === 'skills' ? skillsView() : view === 'run' ? runView() : hero()}
    </div>
  )
}

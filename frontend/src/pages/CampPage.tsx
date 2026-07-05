import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { Archive, Zap } from 'lucide-react'

import { api } from '@/lib/api'
import BoardBackdrop from '@/lib/BoardBackdrop'
import { SkillGlyph } from '@/lib/icons'
import { useProject } from '@/contexts/useProject'
import RichText from '@/components/RichText'
import { ActionCardShell, C, CardBtn, nextMsgId, TonePill, type CardTone } from '@/components/camp/campFlow'
import type { Skill, SkillRun, SkillResult, KnowledgeHit, ProjectCognition } from '@/types/schemas'

// caselib/condition/slang 接真实端点(非技能执行),各自渲染
const SPECIAL_SKILLS = new Set(['caselib', 'condition', 'slang'])
// 拖拽进营地可接入的可解析扩展(与数据基地一致)
const DROP_EXTS = ['.txt', '.md', '.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg']
type SlangItem = { term: string; meaning: string; impact: string; action: string }
type Special =
  | { type: 'knowledge'; hits: KnowledgeHit[] }
  | { type: 'cognition'; items: ProjectCognition[] }
  | { type: 'slang'; items: SlangItem[] }

/* 共创营地 · 暗色重写（Phase 2）。
   视觉对齐 DC 暗色霓虹；数据由 /api/skills 驱动；执行接真 runSkill。
   Phase 2：4 入口→子技能展开 + 方案评审「快速评审/设计委员会(MoA)」模式选择 + MoA 暗色渲染。
   已并入：成果归档回查(自 AgentPage 移植;AgentPage 已退役删除,对话流/外发等在 git 历史,
   追问系统立项时再复活)。
   W0(2026-07-05)：单次成果视图升级为会话内对话流(convo)——技能成果包成流内卡,composer 补
   Enter 发送/发送键;流仅存内存(刷新即清,成果有 SkillResult 归档兜底;持久化列 P2 首位)。 */

// 色票 C 从 campFlow 引入(与原值相同);动作卡外壳/三态 pill 同源,状态语言对齐 seasky 规格
const CAT_ORDER = ['概念与方案', '竞品与研究', '文本与汇报', '出图与表现', '审查与合规']

// 对话流消息:用户文本 / 中性提示 / 技能卡(W1-W4 再加 organize/cleanup/minute 动作卡)
type SkillCardData = { skillId: string; skill: Skill | null; moa: boolean; input: string; busy: boolean; err: string; result: SkillRun | null; special: Special | null }
type FlowMsg =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'hint'; text: string }
  | { id: number; kind: 'skill'; data: SkillCardData }

// 4 个 ASK 入口 → 各自子技能（点入口先展开，不直接跑）
const ENTRIES: Record<string, { title: string; subs: string[] }> = {
  concept: { title: '概念激发', subs: ['concept', 'massing', 'compare', 'facade'] },
  review: { title: '方案评审', subs: ['review', 'compete', 'caselib', 'condition'] },
  flow: { title: '定义工作流', subs: ['task', 'review', 'judge', 'norm'] },
  brief: { title: '汇报提纲', subs: ['brief', 'writer', 'poster', 'slang'] },
}
const ENTRY_IDS = ['concept', 'review', 'flow', 'brief']
// 声明即所跑：judge/brief 后端已是独立真实技能(各有专属 prompt),不再映射到 task/ppt(拆掉早期兼容串台)。

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
                    <div style={{ color: C.mut, marginTop: 2, marginLeft: 4 }}>{it.design_impact ? `影响：${String(it.design_impact)}\u3000` : ''}{it.suggested_action ? `建议：${String(it.suggested_action)}` : ''}</div>
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

// caselib/condition/slang 的真实端点结果暗色渲染
function SpecialView({ s }: { s: Special }) {
  const card = (children: ReactNode, key?: number) => (
    <div key={key} style={{ marginTop: 8, border: '1px solid ' + C.line, borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,.03)' }}>{children}</div>
  )
  if (s.type === 'knowledge') {
    if (!s.hits.length) return <div style={{ color: C.mut }}>知识库无命中。可先到数据基地补充 / 索引资料。</div>
    return (<>
      <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 6 }}>知识库检索命中 {s.hits.length} 条：</div>
      {s.hits.map((h, i) => card(<>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{h.title}{h.locator ? <span style={{ color: C.mut, fontWeight: 400, fontSize: 11 }}> · {h.locator}</span> : null}</div>
        {h.snippet && <div style={{ fontSize: 12, color: C.ink2, marginTop: 3 }}>{h.snippet}</div>}
      </>, i))}
    </>)
  }
  if (s.type === 'cognition') {
    const conf = s.items.filter((c) => c.summary_md || (c.fields && c.fields.length))
    if (!conf.length) return <div style={{ color: C.mut }}>本项目暂无已抽取的结构化认知。可到项目中心「结构化认知」做 AI 抽取。</div>
    return (<>
      <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 6 }}>项目结构化认知 {conf.length} 个模块：</div>
      {conf.map((c) => card(<>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.module_label || c.module}
          <span style={{ marginLeft: 8, fontSize: 10.5, color: c.module_status === 'confirmed' ? C.cyan : C.amber, border: '1px solid ' + C.line, borderRadius: 6, padding: '1px 6px' }}>{c.module_status === 'confirmed' ? '已确认' : '草案'}</span>
        </div>
        {c.summary_md && <div style={{ fontSize: 12, color: C.ink2, marginTop: 3 }}>{c.summary_md}</div>}
      </>, c.id))}
    </>)
  }
  if (!s.items.length) return <div style={{ color: C.mut }}>词典无匹配条目。</div>
  return (<>
    <div style={{ fontSize: 12.5, color: C.mut, marginBottom: 6 }}>甲方黑话翻译 {s.items.length} 条：</div>
    {s.items.map((it, i) => card(<>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>「{it.term}」</div>
      <div style={{ fontSize: 12, color: C.ink2, marginTop: 3 }}>真实含义：{it.meaning}</div>
      {it.impact && <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>设计影响：{it.impact}</div>}
      {it.action && <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>建议动作：{it.action}</div>}
    </>, i))}
  </>)
}

export default function CampPage() {
  const { cur } = useProject()
  const [skills, setSkills] = useState<Skill[]>([])
  const [tab, setTab] = useState<'ask' | 'agents'>('ask')
  const [view, setView] = useState<'hero' | 'entry' | 'skills' | 'convo' | 'archive'>('hero')
  const [entry, setEntry] = useState<string>('')          // 当前展开的入口
  const [text, setText] = useState('')
  const [picker, setPicker] = useState(false)             // 方案评审「快速/设计委员会」选择
  // W0 对话流:消息数组仅存内存(刷新即清;成果有 SkillResult 归档兜底;持久化=P2 第一优先)
  const [msgs, setMsgs] = useState<FlowMsg[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const msgsRef = useRef(msgs)
  msgsRef.current = msgs
  const toBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const s = scrollRef.current
      if (s) s.scrollTop = s.scrollHeight
    })
  }, [])
  const pushMsg = useCallback((m: FlowMsg) => {
    setMsgs((arr) => [...arr, m])
    toBottom()
  }, [toBottom])
  const patchSkillCard = useCallback((id: number, patch: Partial<SkillCardData>) => {
    setMsgs((arr) => arr.map((m) => (m.id === id && m.kind === 'skill' ? { ...m, data: { ...m.data, ...patch } } : m)))
    toBottom()
  }, [toBottom])
  // 成果归档(自 AgentPage 移植)：项目历史成果回查——过几天翻出上次的评图/PPT/图
  const [archItems, setArchItems] = useState<SkillResult[]>([])
  const [archBusy, setArchBusy] = useState(false)
  const [archOpenId, setArchOpenId] = useState<number | null>(null)
  const openArchive = useCallback(() => {
    setView('archive')
    setArchOpenId(null)
    if (!cur) { setArchItems([]); return }
    setArchBusy(true)
    api.listSkillResults(cur.id)
      .then((d) => setArchItems(d.items))
      .catch(() => setArchItems([]))
      .finally(() => setArchBusy(false))
  }, [cur])
  // 拖拽接入：把文件拖进营地 → 上传到当前作用项目(建索引+抽图)→ 成为该项目材料
  const dragDepth = useRef(0)
  const [drag, setDrag] = useState(false)
  const [dropMsg, setDropMsg] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDrag(false)
    const all = Array.from(e.dataTransfer?.files || [])
    if (all.length === 0) return
    const files = all.filter((f) => DROP_EXTS.some((x) => f.name.toLowerCase().endsWith(x)))
    if (files.length === 0) { setDropMsg('没有可接入的文件（支持 txt/md/pdf/docx/pptx/xlsx/图片）。'); return }
    if (!cur) { setDropMsg('请先在顶部选择作用项目，再把文件拖进来。'); return }
    setDropping(true)
    setDropMsg(`正在接入 ${files.length} 个文件到「${cur.name}」…`)
    let ok = 0, fail = 0
    const ids: number[] = []
    for (const f of files) {
      try {
        const pf = await api.uploadProjectFile(cur.id, f)
        ids.push(pf.id)
        try { await api.indexProjectFile(cur.id, pf.id) } catch { /* 索引失败不致命 */ }
        ok++
      } catch { fail++ }
    }
    void Promise.all(ids.map((id) => api.extractFileAssets(cur.id, id).catch(() => null)))
    setDropping(false)
    setDropMsg(`已接入 ${ok} 个文件到「${cur.name}」${fail ? `，失败 ${fail}` : ''} —— 已成为该项目材料，技能/评图可直接用。`)
    setTimeout(() => setDropMsg(null), 6000)
  }, [cur])

  useEffect(() => { api.listSkills().then((d) => setSkills(d.items)).catch(() => setSkills([])) }, [])

  const byId = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])) as Record<string, Skill>, [skills])
  const cats = useMemo(() => {
    const m = new Map<string, Skill[]>()
    for (const s of skills) { const k = s.category || '其它'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(s) }
    return [...m.entries()].sort((a, b) => CAT_ORDER.indexOf(a[0]) - CAT_ORDER.indexOf(b[0]))
  }, [skills])

  const run = useCallback(async (skillId: string, mode = '') => {
    const skill = byId[skillId] || null
    setPicker(false)
    setView('convo')
    const input = text.trim()
    if (input) pushMsg({ id: nextMsgId(), kind: 'user', text: input })
    if (!cur) { pushMsg({ id: nextMsgId(), kind: 'hint', text: '请先在顶部选择作用项目,再共创。' }); return }
    const cardId = nextMsgId()
    pushMsg({ id: cardId, kind: 'skill', data: { skillId, skill, moa: mode === 'moa', input, busy: true, err: '', result: null, special: null } })
    setText('')
    try {
      const r = await api.runSkill(cur.id, skillId, input, '', 0, '', '', mode)
      patchSkillCard(cardId, { busy: false, result: r })
    } catch (e) {
      patchSkillCard(cardId, { busy: false, err: (e as Error).message })
    }
  }, [cur, text, byId, pushMsg, patchSkillCard])

  // caselib/condition/slang 接真实端点(知识检索/认知读取/黑话词典),不走技能执行
  const runSpecial = useCallback(async (skillId: string) => {
    const skill = byId[skillId] || null
    setPicker(false)
    setView('convo')
    const input = text.trim()
    if (input) pushMsg({ id: nextMsgId(), kind: 'user', text: input })
    if (!cur) { pushMsg({ id: nextMsgId(), kind: 'hint', text: '请先在顶部选择作用项目,再共创。' }); return }
    const cardId = nextMsgId()
    pushMsg({ id: cardId, kind: 'skill', data: { skillId, skill, moa: false, input, busy: true, err: '', result: null, special: null } })
    setText('')
    try {
      if (skillId === 'caselib') {
        const r = await api.searchKnowledge(input || cur.name, 8)
        patchSkillCard(cardId, { busy: false, special: { type: 'knowledge', hits: r.hits } })
      } else if (skillId === 'condition') {
        patchSkillCard(cardId, { busy: false, special: { type: 'cognition', items: await api.listCognition(cur.id) } })
      } else {
        patchSkillCard(cardId, { busy: false, special: { type: 'slang', items: await api.querySlang(cur.id, input) } })
      }
    } catch (e) {
      patchSkillCard(cardId, { busy: false, err: (e as Error).message })
    }
  }, [cur, text, byId, pushMsg, patchSkillCard])

  // 卡内重试:同参重跑(仅重置本卡)
  const retrySkillCard = useCallback(async (cardId: number, d: SkillCardData) => {
    if (!cur) return
    patchSkillCard(cardId, { busy: true, err: '' })
    try {
      if (SPECIAL_SKILLS.has(d.skillId)) {
        if (d.skillId === 'caselib') {
          const r = await api.searchKnowledge(d.input || cur.name, 8)
          patchSkillCard(cardId, { busy: false, special: { type: 'knowledge', hits: r.hits } })
        } else if (d.skillId === 'condition') {
          patchSkillCard(cardId, { busy: false, special: { type: 'cognition', items: await api.listCognition(cur.id) } })
        } else {
          patchSkillCard(cardId, { busy: false, special: { type: 'slang', items: await api.querySlang(cur.id, d.input) } })
        }
      } else {
        const r = await api.runSkill(cur.id, d.skillId, d.input, '', 0, '', '', d.moa ? 'moa' : '')
        patchSkillCard(cardId, { busy: false, result: r })
      }
    } catch (e) {
      patchSkillCard(cardId, { busy: false, err: (e as Error).message })
    }
  }, [cur, patchSkillCard])

  // composer 纯文本发送(Enter/发送键):非命令文本如实提示——后端无自由对话 NLU,不假装能聊
  const sendText = useCallback(() => {
    const t = text.trim()
    if (!t) return
    setView('convo')
    pushMsg({ id: nextMsgId(), kind: 'user', text: t })
    pushMsg({ id: nextMsgId(), kind: 'hint', text: '这段话我会作为下一次技能执行的输入。请点一张技能卡(或「+」打开技能库)开始共创;自由对话在后续版本接入。' })
    setText('')
  }, [text, pushMsg])

  // 子技能点击：方案评审 → 弹模式选择;caselib/condition/slang → 真实端点;其余跑技能
  const handleSub = (skillId: string) => {
    if (skillId === 'review') setPicker(true)
    else if (SPECIAL_SKILLS.has(skillId)) runSpecial(skillId)
    else run(skillId)
  }

  const composer = (big: boolean) => (
    <div style={{ padding: 2, borderRadius: 22, background: 'linear-gradient(120deg,rgba(124,92,255,.85),rgba(66,165,255,.6) 42%,rgba(215,168,110,.7))', boxShadow: '0 0 50px rgba(124,92,255,.22)' }}>
      <div style={{ borderRadius: 20, background: 'rgba(8,10,16,.92)', padding: '14px 16px 12px', minHeight: big ? 132 : 'auto', display: 'flex', flexDirection: 'column' }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }}
          placeholder={tab === 'agents' ? '描述拖慢团队的重复工作，让智能体接管…　Enter 发送 · Shift+Enter 换行' : '从一个想法到一套方案，把要共创的事告诉我…　Enter 发送 · Shift+Enter 换行'} rows={big ? 3 : 2}
          style={{ flex: big ? 1 : 'none', background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: C.ink, fontSize: 15, fontFamily: 'inherit', padding: 0, marginBottom: 8 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" title="打开技能库" onClick={() => setView('skills')} style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: C.ink2, fontSize: 17, cursor: 'pointer' }}>+</button>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 11px', borderRadius: 10, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', color: C.ink2, fontSize: 13 }}><BrandMark size={15} /> ROM Max ▾</span>
          <button type="button" title="发送 · Enter" onClick={sendText}
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', background: text.trim() ? 'linear-gradient(145deg,#8d72ff,#6a4fe0)' : 'rgba(255,255,255,.08)', color: text.trim() ? '#fff' : C.mut, fontSize: 15, display: 'grid', placeItems: 'center', transition: 'all .2s' }}>↑</button>
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
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <BoardBackdrop mode="dots" />
        <div style={{ width: '100%', maxWidth: 760, position: 'relative', zIndex: 1 }}>
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
                      <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: C.ink2, display: 'grid', placeItems: 'center', fontSize: 16 }}><SkillGlyph id={id} fallback={s?.icon} /></div>
                      <div><div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{ENTRIES[id].title}</div><div style={{ fontSize: 12, color: C.mut, marginTop: 4, lineHeight: 1.4 }}>{ENTRIES[id].subs.length} 个子技能 · 点击展开</div></div>
                    </Card>
                  )
                })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" onClick={() => setView('skills')} style={{ flex: 1.4, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 36, borderRadius: 10, border: '1px dashed rgba(255,255,255,.16)', background: 'rgba(255,255,255,.025)', color: '#b9bdcc', fontSize: 12.5, fontWeight: 600 }}>▤ 浏览全部技能 <span style={{ color: C.purple }}>→</span></button>
            <button type="button" onClick={openArchive} style={{ flex: 1, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 36, borderRadius: 10, border: '1px dashed rgba(255,255,255,.16)', background: 'rgba(255,255,255,.025)', color: '#b9bdcc', fontSize: 12.5, fontWeight: 600 }}><Archive size={15} /> 历史成果</button>
          </div>
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
                    <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: (s.color || C.purple) + '22', border: '1px solid ' + (s.color || C.purple) + '55', color: s.color || C.purple, display: 'grid', placeItems: 'center', fontSize: 16 }}><SkillGlyph id={sid} fallback={s.icon} /></div>
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

  // 成果归档视图(自 AgentPage 移植)：真实历史成果列表,点条目展开;MoA 成果用暗色评图面板渲染
  const archiveView = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '22px 30px 14px' }}>
        <BrandMark size={30} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>历史成果</div>
          <div style={{ fontSize: 12.5, color: C.mut, marginTop: 2 }}>{cur ? `${cur.name} · ${archItems.length} 条成果 · 点条目展开` : '未选择项目'}</div>
        </div>
        <button type="button" onClick={() => setView('hero')} style={{ fontFamily: 'inherit', cursor: 'pointer', height: 34, padding: '0 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: C.ink2, fontSize: 13 }}>✕ 关闭</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 30px 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {archBusy && <div style={{ color: C.mut, fontSize: 13 }}>加载中…</div>}
          {!archBusy && !cur && <div style={{ color: C.mut, fontSize: 13 }}>请先在顶部选择作用项目。</div>}
          {!archBusy && cur && archItems.length === 0 && (
            <div style={{ color: C.mut, fontSize: 13 }}>本项目还没有成果。跑一次技能（方案评审 / PPT / 生图…），成果会自动归档到这里。</div>
          )}
          {archItems.map((r) => {
            const open = archOpenId === r.id
            let cl: Record<string, unknown> | null = null
            if (open && r.output_json) {
              try { const d = JSON.parse(r.output_json); cl = (d && (d as Record<string, unknown>).checklist) as Record<string, unknown> | null } catch { cl = null }
            }
            const sk = byId[r.skill_id]
            return (
              <div key={r.id} style={{ border: '1px solid ' + (open ? 'rgba(124,92,255,.4)' : C.line), borderRadius: 14, background: C.glass, overflow: 'hidden' }}>
                <button type="button" onClick={() => setArchOpenId(open ? null : r.id)}
                  style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'transparent', border: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', color: C.ink }}>
                  <span style={{ color: C.mut }}>{open ? '▾' : '▸'}</span>
                  <span style={{ fontSize: 15, display: 'inline-flex', color: C.ink2 }}><SkillGlyph id={r.skill_id} fallback={sk?.icon} size={15} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || sk?.title || r.skill_id}</span>
                  {r.status !== 'ok' && <span style={{ fontSize: 10.5, color: '#ff9b9b', border: '1px solid rgba(255,94,102,.4)', background: 'rgba(255,94,102,.12)', borderRadius: 6, padding: '1px 7px' }}>{r.status}</span>}
                  <span style={{ fontSize: 11, color: C.mut2, whiteSpace: 'nowrap' }}>{(r.created_at || '').slice(0, 16).replace('T', ' ')}</span>
                </button>
                {open && (
                  <div style={{ padding: '4px 16px 16px', color: C.ink2, fontSize: 13.5, lineHeight: 1.7 }}>
                    {cl ? <MoaDark cl={cl} />
                      : r.image_path && cur ? (
                        <a href={api.projectImageUrl(cur.id, r.image_path)} target="_blank" rel="noreferrer">
                          <img src={api.projectImageUrl(cur.id, r.image_path)} alt={r.title} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid ' + C.line }} />
                        </a>
                      ) : <RichText text={r.content} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

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
                      <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, background: (s.color || C.purple) + '22', border: '1px solid ' + (s.color || C.purple) + '55', color: s.color || C.purple, display: 'grid', placeItems: 'center', fontSize: 16 }}><SkillGlyph id={s.id} fallback={s.icon} /></div>
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

  // W0 对话流:消息自上而下追加;技能卡三态(⏳/成果/失败+重试);底部 composer 常驻
  const skillCard = (id: number, d: SkillCardData) => {
    let moaChecklist: Record<string, unknown> | null = null
    if (d.moa && d.result?.status === 'ok' && d.result.output_json) {
      try { const j = JSON.parse(d.result.output_json); moaChecklist = (j && j.checklist) || null } catch { moaChecklist = null }
    }
    const tone: CardTone = d.busy ? 'pending' : d.err || d.result?.status === 'error' ? 'error'
      : d.result?.status === 'not_configured' || d.result?.status === 'no_material' ? 'neutral' : 'ok'
    const pillText = d.busy ? (d.moa ? '设计委员会评审中' : '共创中') : tone === 'error' ? '失败' : tone === 'neutral' ? (d.result?.status === 'not_configured' ? '未配置' : '无材料') : '完成'
    return (
      <ActionCardShell key={id} icon={<SkillGlyph id={d.skillId} fallback={d.skill?.icon} size={15} />}
        title={(d.skill?.title || d.skillId) + (d.moa ? ' · 设计委员会' : '')} pill={<TonePill tone={tone} text={pillText} />}>
        {d.busy && <div style={{ color: C.cyan }}>⏳ {d.moa ? '正在召集设计委员会（三位评图人 + 主审，约 15–60 秒）…' : `正在共创「${d.skill?.title || d.skillId}」…`}</div>}
        {!d.busy && d.err && (
          <div style={{ color: C.red }}>执行失败：{d.err}
            <span style={{ marginLeft: 10 }}><CardBtn onClick={() => retrySkillCard(id, d)}>重试</CardBtn></span>
          </div>
        )}
        {!d.busy && d.special && <SpecialView s={d.special} />}
        {!d.busy && d.result && d.result.status !== 'ok' && (
          <div style={{ color: C.mut }}>
            {d.result.status === 'not_configured' && '尚未配置 AI 引擎。到「设置」填入 DeepSeek API Key 后即可共创。'}
            {d.result.status === 'no_material' && '本项目暂无可用材料。请先到数据基地上传/索引资料。'}
            {d.result.status === 'error' && `执行失败：${d.result.error_message || d.result.content}`}
          </div>
        )}
        {!d.busy && d.result && d.result.status === 'ok' && (
          moaChecklist ? <MoaDark cl={moaChecklist} />
            : d.result.image_url && cur ? (
              <a href={api.projectImageUrl(cur.id, d.result.image_url)} target="_blank" rel="noreferrer"><img src={api.projectImageUrl(cur.id, d.result.image_url)} alt={d.skill?.title} style={{ maxWidth: '100%', borderRadius: 12, border: '1px solid ' + C.line }} /></a>
            ) : <div style={{ color: C.ink }}><RichText text={d.result.content} /></div>
        )}
      </ActionCardShell>
    )
  }

  const convoView = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ height: 58, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', borderBottom: '1px solid ' + C.line, background: 'rgba(3,4,6,.4)' }}>
        <button type="button" onClick={() => setView(entry ? 'entry' : 'hero')} style={{ fontFamily: 'inherit', cursor: 'pointer', height: 34, padding: '0 13px', borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', color: C.ink2, fontSize: 13 }}>← 返回营地</button>
        <BrandMark size={22} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>共创对话流</div>
        <div style={{ fontSize: 11.5, color: C.mut2, marginLeft: 'auto' }}>{cur ? `${cur.name} · 本次会话 · 成果自动归档` : '未选择项目'}</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 26 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {msgs.length === 0 && <div style={{ color: C.mut, fontSize: 13, textAlign: 'center', marginTop: 40 }}>从下方输入,或回营地挑一张技能卡开始。</div>}
          {msgs.map((m) => {
            if (m.kind === 'user') return (
              <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '82%', background: 'rgba(124,92,255,.14)', border: '1px solid rgba(124,92,255,.3)', borderRadius: '16px 4px 16px 16px', padding: '10px 14px', fontSize: 13.5, color: C.ink, lineHeight: 1.65 }}>{m.text}</div>
            )
            if (m.kind === 'hint') return (
              <div key={m.id} style={{ alignSelf: 'center', maxWidth: '88%', color: C.mut, fontSize: 12.5, textAlign: 'center', border: '1px dashed ' + C.line, borderRadius: 12, padding: '8px 14px' }}>{m.text}</div>
            )
            return skillCard(m.id, m.data)
          })}
        </div>
      </div>
      <div style={{ flexShrink: 0, padding: '14px 26px 22px', borderTop: '1px solid ' + C.line, background: 'rgba(3,4,6,.4)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>{composer(false)}</div>
      </div>
    </div>
  )

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDrag(true) }}
      onDragOver={(e) => { e.preventDefault() }}
      onDragLeave={(e) => { e.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDrag(false) }}
      onDrop={onDrop}
      style={{ minHeight: '100%', position: 'relative', color: C.ink, display: 'flex', flexDirection: 'column', background: 'radial-gradient(circle at 18% -6%, rgba(124,92,255,.28), transparent 31%), radial-gradient(circle at 86% 4%, rgba(66,165,255,.16), transparent 28%), radial-gradient(circle at 64% 108%, rgba(215,168,110,.11), transparent 32%), linear-gradient(180deg, #030406 0%, #07080c 44%, #030406 100%)' }}>
      {view === 'skills' ? skillsView() : view === 'convo' ? convoView() : view === 'archive' ? archiveView() : view === 'entry' ? entryView() : hero()}

      {/* 拖拽接入：发光虚线遮罩 + 接入结果 toast */}
      {drag && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,10,16,.7)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ border: '2px dashed ' + C.purple, borderRadius: 24, padding: '40px 64px', background: 'rgba(124,92,255,.08)', color: '#fff', fontSize: 18, fontWeight: 700, textAlign: 'center', boxShadow: '0 0 60px rgba(124,92,255,.4)' }}>
            ⬇ 松手接入到{cur ? `「${cur.name}」` : '项目'}
            <div style={{ fontSize: 12, fontWeight: 400, color: C.ink2, marginTop: 8 }}>{cur ? 'txt/md/pdf/docx/pptx/xlsx/图片 → 成为该项目材料' : '请先在顶部选择作用项目'}</div>
          </div>
        </div>
      )}
      {dropMsg && (
        <div style={{ position: 'fixed', left: '50%', bottom: 30, transform: 'translateX(-50%)', zIndex: 90, background: '#171a24', border: '1px solid ' + C.line, borderRadius: 12, padding: '10px 16px', color: C.ink2, fontSize: 13, boxShadow: '0 10px 30px rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'min(560px,92vw)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dropping ? C.amber : C.cyan, boxShadow: `0 0 8px ${dropping ? C.amber : C.cyan}` }} />
          <span style={{ flex: 1 }}>{dropMsg}</span>
          {!dropping && <button type="button" onClick={() => setDropMsg(null)} style={{ background: 'transparent', border: 0, color: C.mut, cursor: 'pointer', fontSize: 14 }}>✕</button>}
        </div>
      )}

      {/* 方案评审 · 模式选择 */}
      {picker && (
        <div onClick={() => setPicker(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(10px) saturate(120%)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px,92vw)', borderRadius: 20, border: '1px solid ' + C.line, background: 'linear-gradient(160deg,#0c0e16,#07080c)', padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>方案评审 · 选模式</div>
            <div style={{ fontSize: 12, color: C.mut, marginBottom: 16 }}>同一份项目认知，两种评图方式。</div>
            <button type="button" onClick={() => run('review', '')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.ink, border: '1px solid ' + C.line, borderRadius: 14, padding: '14px 16px', background: C.glass, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={14} /> 快速评审</div><div style={{ fontSize: 12, color: C.mut, marginTop: 3 }}>单模型，约 3 秒。对话式评审意见。</div>
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

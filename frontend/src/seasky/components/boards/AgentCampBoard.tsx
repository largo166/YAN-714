import { useCallback, useRef, useState, type KeyboardEvent } from 'react'

import { AGENTS, type QuickCard } from '../../data/skills.mock'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { LS_KEYS, MODELS } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { AgentComposer } from '../agent/AgentComposer'
import { SkillLibraryPanel } from '../agent/SkillLibraryPanel'
import { SkillQuickCards } from '../agent/SkillQuickCards'
import { GhostButton, Label, Pill } from '../common/PillButton'

/* ═══ b2 共创营地(功能基准板,截图3像素级布局——重点保护区) ═══
   双区:logo球+双Tab+大composer+四快捷卡+浏览全部技能;
   二级态:对话(卡片/发送后进入,可返回)+ 技能库浮层。
   禁止倒退成普通左右栏聊天窗口。 */

interface Msg {
  role: 'user' | 'ai'
  html: string
  name?: string
  typing?: boolean
}

export function AgentCampBoard({ projectName }: { projectName: string }) {
  const [tabRaw, setTab] = useLocalStorage(LS_KEYS.campTab, 'ask')
  const tab = tabRaw === 'agents' ? 'agents' : 'ask'
  const [model, setModel] = useLocalStorage(LS_KEYS.model, MODELS[0])
  const [view, setView] = useState<'hero' | 'convo'>('hero')
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [agentIdx, setAgentIdx] = useState(0)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const busyRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const convoTaRef = useRef<HTMLTextAreaElement>(null)

  const toBottom = () => {
    requestAnimationFrame(() => {
      const s = scrollRef.current
      if (s) s.scrollTop = s.scrollHeight
    })
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

  /** 开对话:user 气泡 → 打点 loading → 1.1s 后回复(与母版相同的诚实演示机制) */
  const openConvo = useCallback(
    (agent: number, userText: string, reply: string) => {
      setAgentIdx(agent)
      setView('convo')
      setMsgs([
        { role: 'user', html: esc(userText) },
        { role: 'ai', html: '', name: AGENTS[agent].name, typing: true },
      ])
      busyRef.current = true
      toBottom()
      setTimeout(() => {
        setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, html: reply, typing: false } : x)))
        busyRef.current = false
        toBottom()
      }, 1100)
    },
    [],
  )

  const pickCard = useCallback(
    (c: QuickCard) => {
      openConvo(
        c.agent,
        tab === 'ask' ? `用「${c.t}」推进当前项目。` : `请${c.t}接管当前项目上下文。`,
        c.reply ? c.reply(projectName) : AGENTS[c.agent].reply(projectName),
      )
    },
    [openConvo, projectName, tab],
  )

  const heroSend = useCallback(
    (txt: string) => openConvo(0, txt, AGENTS[0].reply(projectName)),
    [openConvo, projectName],
  )

  const pickSkill = useCallback(
    (n: string) => {
      setSkillsOpen(false)
      openConvo(
        0,
        `用「${n}」技能推进当前项目。`,
        `收到,已按「${n}」的口径接管。基于「${projectName}」已确认认知开始推演,完成后逐条挂出处。`,
      )
    },
    [openConvo, projectName],
  )

  const convoSend = () => {
    if (busyRef.current) return
    const ta = convoTaRef.current
    if (!ta) return
    const txt = ta.value.trim()
    if (!txt) return
    ta.value = ''
    setMsgs((m) => [
      ...m,
      { role: 'user', html: esc(txt) },
      { role: 'ai', html: '', name: AGENTS[agentIdx].name, typing: true },
    ])
    busyRef.current = true
    toBottom()
    setTimeout(() => {
      setMsgs((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, html: AGENTS[agentIdx].reply(projectName), typing: false } : x)))
      busyRef.current = false
      toBottom()
    }, 1100)
  }
  const onConvoKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      convoSend()
    }
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* ── 双区 hero(截图3基准) ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-11" style={{ display: view === 'hero' ? 'flex' : 'none' }}>
        <div className="h-[46px] w-[46px] flex-none rounded-[14px] shadow-sklogo" data-in
          style={{ background: 'radial-gradient(circle at 32% 28%, #bfe0f2, var(--sk-primary) 45%, var(--sk-primary-deep) 100%)' }}
        />
        <div className="mt-4 font-skcjk text-[34px] font-light tracking-[0.16em] [text-indent:0.16em] text-sk-fg" data-in>
          <b
            className="font-normal"
            style={{
              background: 'linear-gradient(to right, #a8cfe0, var(--sk-primary))',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            共创营地
          </b>
          <sup className="ml-1 text-[12px] text-sk-primary">2</sup>
        </div>

        <div className="mt-5 flex gap-1 rounded-full border-[0.5px] border-sk-hairsoft bg-[rgba(242,241,238,.045)] p-[3px]" data-in>
          {(
            [
              ['ask', '✦ 对话共创'],
              ['agents', '◎ 设计智能体'],
            ] as const
          ).map(([key, txt]) => (
            <button
              key={key}
              className={cn(
                'cursor-pointer rounded-full border-0 bg-transparent px-[18px] py-[7px] font-skcjk text-[12.5px] font-normal tracking-[0.1em] transition-all duration-200',
                tab === key ? 'bg-[rgba(242,241,238,.1)] text-sk-fg' : 'text-sk-muted2',
              )}
              onClick={() => setTab(key)}
            >
              {txt}
            </button>
          ))}
        </div>

        <AgentComposer
          placeholder={
            tab === 'ask'
              ? '从一个想法到一套方案,把要共创的事告诉我…　Enter 发送 · Shift+Enter 换行'
              : '把任务交给一位设计智能体…　Enter 发送 · Shift+Enter 换行'
          }
          model={model}
          onModelSelect={setModel}
          onSend={heroSend}
        />

        <div className="mt-4 font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] [text-indent:0.3em] text-sk-muted2" data-in>
          挑一个快捷共创,或直接开口 — 我会带着你的项目上下文一起想。
        </div>

        <SkillQuickCards tab={tab} onPick={pickCard} />

        <button
          className="mt-3.5 flex w-[min(1020px,94%)] cursor-pointer items-center justify-center gap-[9px] rounded-[14px] border-[0.5px] border-dashed border-sk-hair bg-transparent p-3 font-skcjk text-[12.5px] font-light tracking-[0.14em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary [&:hover>span]:translate-x-1"
          data-in
          onClick={() => setSkillsOpen(true)}
        >
          ▤ 浏览全部技能 <span className="transition-transform duration-200">→</span>
        </button>
      </div>

      {/* ── 对话态(二级) ── */}
      <div className="absolute inset-0 flex-col" style={{ display: view === 'convo' ? 'flex' : 'none' }}>
        <div className="flex flex-none items-center gap-3.5 px-14 pb-3 pt-4">
          <GhostButton onClick={() => setView('hero')}>← 返回营地</GhostButton>
          <Pill tone="pri">{projectName} · 认知已挂载</Pill>
          <Pill tone="ok">认知 3 域 · 出处 6</Pill>
          <Label className="ml-auto">{AGENTS[agentIdx].name}</Label>
        </div>
        <div ref={scrollRef} className="sk-scroll flex flex-1 flex-col gap-[26px] overflow-y-auto px-14 pb-5 pt-2">
          {msgs.map((m, i) => (
            <div key={i} className={cn('flex max-w-[760px] gap-4', m.role === 'user' && 'flex-row-reverse self-end')}>
              <div
                className={cn(
                  'grid h-8 w-8 flex-none place-items-center rounded-[9px] border-[0.5px] font-sans text-[11px] font-medium tracking-[0.05em]',
                  m.role === 'user'
                    ? 'border-sk-hair text-sk-muted'
                    : 'border-[rgba(127,179,207,.45)] text-sk-primary shadow-[0_0_14px_rgba(127,179,207,.12)]',
                )}
              >
                {m.role === 'user' ? '你' : AGENTS[agentIdx].g}
              </div>
              <div
                className={cn(
                  'font-skcjk text-[13.5px] font-light leading-[2.05] tracking-[0.03em] text-[#d5d8db]',
                  m.role === 'user' &&
                    'rounded-[16px_4px_16px_16px] border-[0.5px] border-[rgba(127,179,207,.18)] bg-[rgba(127,179,207,.09)] px-[18px] py-[13px] text-sk-fg',
                  m.role === 'ai' && 'pt-1',
                )}
              >
                {m.name && (
                  <div className="mb-[7px] font-skcjk text-[10.5px] font-normal tracking-[0.1em] text-sk-muted2">{m.name}</div>
                )}
                {m.typing ? (
                  <span className="sk-typing">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: m.html }} />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-14 pb-[22px]">
          <div className="relative rounded-[18px] border-[0.5px] border-sk-border bg-sk-composer p-4 px-[18px] pb-3 backdrop-blur-[14px] transition-all duration-[250ms] focus-within:border-[rgba(127,179,207,.45)] focus-within:shadow-[0_0_30px_rgba(127,179,207,.1)]">
            <textarea
              ref={convoTaRef}
              className="h-[52px] w-full resize-none border-0 bg-transparent font-skcjk text-[14px] font-light leading-[1.8] tracking-[0.05em] text-sk-fg outline-none placeholder:text-sk-muted2"
              placeholder="继续布置…　Enter 发送 · Shift+Enter 换行"
              onKeyDown={onConvoKey}
            />
            <div className="mt-2 flex items-center gap-2">
              {['@ 挂载认知', '# 引用文件', '/ 技能'].map((t) => (
                <button
                  key={t}
                  className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-1 font-skcjk text-[10.5px] font-light tracking-[0.1em] text-sk-muted2 transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                >
                  {t}
                </button>
              ))}
              <button
                className="ml-auto grid h-[34px] w-[34px] cursor-pointer place-items-center rounded-[10px] border-0 bg-sk-primary text-[15px] text-[#0a0c0e] transition-colors duration-200 hover:bg-[#8fc0da]"
                title="发送"
                onClick={convoSend}
              >
                ↑
              </button>
            </div>
          </div>
        </div>
      </div>

      <SkillLibraryPanel open={skillsOpen} onClose={() => setSkillsOpen(false)} onPick={pickSkill} />
    </div>
  )
}

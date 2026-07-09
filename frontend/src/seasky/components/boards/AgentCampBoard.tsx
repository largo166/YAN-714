import { useCallback, useRef, useState, type KeyboardEvent } from 'react'

import RichText from '@/components/RichText'
import type { Skill, SkillRun } from '@/types/schemas'

import { useLocalStorage } from '../../hooks/useLocalStorage'
import type { SkillsLive } from '../../hooks/useSkillsLive'
import { LS_KEYS } from '../../lib/constants'
import { cn } from '../../lib/cn'
import { campService as cs } from '../../services'
import { AgentComposer } from '../agent/AgentComposer'
import { CleanupFlowCard } from '../agent/CleanupFlowCard'
import { CommandPalette, type PaletteItem } from '../agent/CommandPalette'
import { FlowBtn, FlowCard, FlowTonePill, type CardTone } from '../agent/flowKit'
import { MinuteFlowCard } from '../agent/MinuteFlowCard'
import { MoaView, SpecialResultView, type Special } from '../agent/MoaView'
import { OrganizeFlowCard, type OrganizePayload } from '../agent/OrganizeFlowCard'
import { SkillLibraryPanel } from '../agent/SkillLibraryPanel'
import { SkillQuickCards } from '../agent/SkillQuickCards'
import { CAMP_QC_AGENTS, CAMP_QC_ASK } from '../../data/campCards'
import { GhostButton, Label, Pill } from '../common/PillButton'

/* ═══ b2 共创营地(功能基准板,构图冻结铁律区) ═══
   hero 双区结构一像素不动:logo球+双Tab+大composer+四快捷卡+浏览全部技能。
   本波只换数据源:快捷卡/技能库=真 GET /api/skills;对话态=真 runSkill/MoA/special;
   动作卡(接入/清理/纪要)进对话流;建会卡按拍板推迟(TOKEN 后置)。 */

const DROP_EXTS = ['.txt', '.md', '.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg']
const SPECIAL_SKILLS = new Set(['caselib', 'condition', 'slang'])

/* 快捷卡数据源已外置到 data/campCards.ts(纪律:组件内不定义与数据源同名的本地常量) */

interface SkillCardData {
  skillId: string
  skill: Skill | null
  moa: boolean
  input: string
  busy: boolean
  err: string
  result: SkillRun | null
  special: Special | null
}
type FlowMsg =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'hint'; text: string }
  | { id: number; kind: 'skill'; data: SkillCardData }
  | { id: number; kind: 'organize'; data: OrganizePayload }
  | { id: number; kind: 'cleanup' }
  | { id: number; kind: 'minute' }

let seq = 1
const nid = () => seq++

export function AgentCampBoard({
  projectId,
  projectName,
  onGoBoard,
  active: _active,
  live,
}: {
  projectId: number | null
  projectName: string
  onGoBoard: (i: number) => void
  active: boolean
  live: SkillsLive
}) {
  const [tabRaw, setTab] = useLocalStorage(LS_KEYS.campTab, 'ask')
  const tab = tabRaw === 'agents' ? 'agents' : 'ask'
  const [view, setView] = useState<'hero' | 'convo'>('hero')
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [picker, setPicker] = useState(false) /* 方案评审:快速/设计委员会 模式选择(紫黑同款能力) */
  const [paletteOpen, setPaletteOpen] = useState(false) /* 命令面板(/ 触发,能力总线确认基座) */
  const [pending, setPending] = useState<PaletteItem | null>(null) /* 已预填技能:发送键=确认执行,永不静默 */
  const [msgs, setMsgs] = useState<FlowMsg[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const convoTaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  /* live 由 AppShell 汇聚层(useBoardLive)传入,不再自调 useSkillsLive——单一数据源(hotfix1) */

  const toBottom = () => {
    requestAnimationFrame(() => {
      const s = scrollRef.current
      if (s) s.scrollTop = s.scrollHeight
    })
  }
  const push = useCallback((m: FlowMsg) => {
    setMsgs((arr) => [...arr, m])
    toBottom()
  }, [])
  const patchSkill = useCallback((id: number, patch: Partial<SkillCardData>) => {
    setMsgs((arr) => arr.map((m) => (m.id === id && m.kind === 'skill' ? { ...m, data: { ...m.data, ...patch } } : m)))
    toBottom()
  }, [])

  /* ── 真实技能执行(runSkill/MoA/special 三通道,与紫黑同端点) ── */
  const runSkill = useCallback(
    async (skillId: string, input: string, mode = '') => {
      setView('convo')
      setPicker(false)
      if (input) push({ id: nid(), kind: 'user', text: input })
      if (projectId == null) {
        push({ id: nid(), kind: 'hint', text: '请先在项目中心选择作用项目,再共创。' })
        return
      }
      const cardId = nid()
      push({
        id: cardId, kind: 'skill',
        data: { skillId, skill: live.byId[skillId] ?? null, moa: mode === 'moa', input, busy: true, err: '', result: null, special: null },
      })
      try {
        if (SPECIAL_SKILLS.has(skillId)) {
          if (skillId === 'caselib') {
            const r = await cs.searchKnowledge(input || projectName, 8)
            patchSkill(cardId, { busy: false, special: { type: 'knowledge', hits: r.hits } })
          } else if (skillId === 'condition') {
            patchSkill(cardId, { busy: false, special: { type: 'cognition', items: await cs.listCognition(projectId) } })
          } else {
            patchSkill(cardId, { busy: false, special: { type: 'slang', items: await cs.querySlang(projectId, input) } })
          }
        } else {
          const r = await cs.runSkill(projectId, skillId, input, '', 0, '', '', mode)
          patchSkill(cardId, { busy: false, result: r })
        }
      } catch (e) {
        patchSkill(cardId, { busy: false, err: (e as Error).message })
      }
    },
    [projectId, projectName, live.byId, push, patchSkill],
  )

  const retry = useCallback(
    (id: number, d: SkillCardData) => {
      patchSkill(id, { busy: true, err: '' })
      void (async () => {
        if (projectId == null) return
        try {
          if (SPECIAL_SKILLS.has(d.skillId)) {
            if (d.skillId === 'caselib') {
              const r = await cs.searchKnowledge(d.input || projectName, 8)
              patchSkill(id, { busy: false, special: { type: 'knowledge', hits: r.hits } })
            } else if (d.skillId === 'condition') {
              patchSkill(id, { busy: false, special: { type: 'cognition', items: await cs.listCognition(projectId) } })
            } else {
              patchSkill(id, { busy: false, special: { type: 'slang', items: await cs.querySlang(projectId, d.input) } })
            }
          } else {
            const r = await cs.runSkill(projectId, d.skillId, d.input, '', 0, '', '', d.moa ? 'moa' : '')
            patchSkill(id, { busy: false, result: r })
          }
        } catch (e) {
          patchSkill(id, { busy: false, err: (e as Error).message })
        }
      })()
    },
    [projectId, projectName, patchSkill],
  )

  /* ── 快捷卡/技能库/命令面板点击:预填而非直跑(ADR-001 确认基座) ──
     review 仍弹模式选择(其本身即确认场景);其余技能落 pending,发送键=确认执行。 */
  const composerText = useRef('')
  const preSelect = useCallback(
    (skillId: string, title?: string, category = '', slash?: string, confirm?: boolean) => {
      if (skillId === 'review') {
        setPicker(true)
        return
      }
      /* 特殊检索类(caselib/condition/slang)是只读、无副作用、无参数 → 预填后即可发,但仍需用户按发送确认 */
      setPending({ skillId, title: title ?? skillId, desc: '', category, slash, confirm })
    },
    [],
  )
  /* 命令面板选中:统一走预填 */
  const pickFromPalette = useCallback(
    (it: PaletteItem) => {
      setPaletteOpen(false)
      preSelect(it.skillId, it.title, it.category, it.slash, it.confirm)
    },
    [preSelect],
  )
  const clearPending = useCallback(() => setPending(null), [])

  /* ── 动作卡入口(行动条/附件) ── */
  const startOrganize = useCallback(
    (all: File[]) => {
      if (all.length === 0) return
      const files = all.filter((f) => DROP_EXTS.some((x) => f.name.toLowerCase().endsWith(x)))
      const skipped = all.filter((f) => !DROP_EXTS.some((x) => f.name.toLowerCase().endsWith(x))).map((f) => f.name)
      setView('convo')
      if (files.length === 0) {
        push({ id: nid(), kind: 'hint', text: '没有可接入的文件(支持 txt/md/pdf/docx/pptx/xlsx/图片)。' })
        return
      }
      if (projectId == null) {
        push({ id: nid(), kind: 'hint', text: '请先选择作用项目,再接入资料。' })
        return
      }
      push({ id: nid(), kind: 'organize', data: { files, skipped, projectId, projectName } })
      /* 工单§5:识别到文件夹拖入→轻建议去数据基地整理。浏览器拿不到文件夹绝对路径,
         故只做识别+引导,不预填 workspace 真路径(诚实:预填路径浏览器端做不到) */
      const isFolder = all.some((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath?.includes('/'))
      if (isFolder) {
        push({ id: nid(), kind: 'hint', text: '检测到整个文件夹——上面已按文件接入;若想扫描清理该目录的临时/副本文件,可点下方「🧹 一键清理」到数据基地整理。' })
      }
    },
    [projectId, projectName, push],
  )
  const openCleanup = useCallback(() => {
    setView('convo')
    push({ id: nid(), kind: 'cleanup' })
  }, [push])
  const openMinute = useCallback(() => {
    setView('convo')
    push({ id: nid(), kind: 'minute' })
  }, [push])

  const heroSend = useCallback(
    (txt: string) => {
      /* 发送=确认执行:有预填技能则跑它(消费后清空),否则自由文本走智能研判 judge */
      if (pending) {
        const sid = pending.skillId
        setPending(null)
        void runSkill(sid, txt)
      } else if (txt) {
        void runSkill('judge', txt)
      }
    },
    [runSkill, pending],
  )
  const convoSend = () => {
    const ta = convoTaRef.current
    if (!ta) return
    const txt = ta.value.trim()
    if (pending) {
      const sid = pending.skillId
      setPending(null)
      ta.value = ''
      void runSkill(sid, txt)
      return
    }
    if (!txt) return
    ta.value = ''
    void runSkill('judge', txt)
  }
  const onConvoKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      convoSend()
    }
  }

  /* ── 技能成果卡渲染(三态) ── */
  const renderSkillCard = (id: number, d: SkillCardData) => {
    let moaChecklist: Record<string, unknown> | null = null
    if (d.moa && d.result?.status === 'ok' && d.result.output_json) {
      try {
        const j = JSON.parse(d.result.output_json)
        moaChecklist = (j && j.checklist) || null
      } catch {
        moaChecklist = null
      }
    }
    const tone: CardTone = d.busy
      ? 'pending'
      : d.err || d.result?.status === 'error'
        ? 'error'
        : d.result?.status === 'not_configured' || d.result?.status === 'no_material'
          ? 'neutral'
          : 'ok'
    const pillText = d.busy
      ? d.moa ? '设计委员会评审中' : '共创中'
      : tone === 'error' ? '失败'
        : tone === 'neutral' ? (d.result?.status === 'not_configured' ? '未配置' : '无材料') : '完成'
    return (
      <FlowCard
        key={id}
        icon={d.skill?.icon || '✦'}
        title={(d.skill?.title || d.skillId) + (d.moa ? ' · 设计委员会' : '')}
        pill={<FlowTonePill tone={tone} text={pillText} />}
      >
        {d.busy && (
          <div className="text-sk-warn">
            {d.moa ? '正在召集设计委员会(三位评图人 + 主审,约 15–60 秒)…' : `正在共创「${d.skill?.title || d.skillId}」…`}
          </div>
        )}
        {!d.busy && d.err && (
          <div className="text-sk-risk">
            执行失败:{d.err}
            <span className="ml-2.5 inline-block"><FlowBtn onClick={() => retry(id, d)}>重试</FlowBtn></span>
          </div>
        )}
        {!d.busy && d.special && <SpecialResultView s={d.special} />}
        {!d.busy && d.result && d.result.status !== 'ok' && (
          <div className="text-sk-muted">
            {d.result.status === 'not_configured' && '尚未配置 AI 引擎。到「设置」填入 DeepSeek API Key 后即可共创。'}
            {d.result.status === 'no_material' && '本项目暂无可用材料。请先接入/索引资料。'}
            {d.result.status === 'error' && `执行失败:${d.result.error_message || d.result.content}`}
          </div>
        )}
        {!d.busy && d.result && d.result.status === 'ok' && (
          moaChecklist ? (
            <MoaView cl={moaChecklist} />
          ) : d.result.image_url && projectId != null ? (
            <a href={cs.projectImageUrl(projectId, d.result.image_url)} target="_blank" rel="noreferrer">
              <img
                src={cs.projectImageUrl(projectId, d.result.image_url)}
                alt={d.skill?.title}
                className="max-w-full rounded-[12px] border-[0.5px] border-sk-border"
              />
            </a>
          ) : (
            <div className="text-sk-fg"><RichText text={d.result.content} /></div>
          )
        )}
      </FlowCard>
    )
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* ── 双区 hero(截图3基准,构图冻结) ── */}
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

        {/* 单一内容列 W≈920:composer/四卡/动作行/浏览技能全部左右边缘对齐此列(消除倒三角) */}
        <div className="mt-[22px] flex w-[min(920px,92vw)] flex-col items-stretch gap-4" data-in>
          <AgentComposer
            placeholder={
              tab === 'ask'
                ? '写下要共创的事,或按 / 挑一项能力'
                : '写下要交办的任务,或按 / 挑一位设计智能体'
            }
            onSend={heroSend}
            onDraft={(t) => { composerText.current = t }}
            onAttach={startOrganize}
            onSlash={() => setPaletteOpen(true)}
            pendingLabel={pending?.title ?? null}
            onClearPending={clearPending}
          />

          <SkillQuickCards
            cards={tab === 'ask' ? CAMP_QC_ASK : CAMP_QC_AGENTS}
            onPick={(skillId) => preSelect(skillId, live.byId[skillId]?.title)}
          />

          {/* 行动条:办事入口(接入/清理/纪要;建会 TOKEN 后置推迟)——点击只插卡,绝不直接执行 */}
          <div className="flex w-full items-center justify-center gap-2.5">
            {([
              ['⬒ 接入资料', () => fileRef.current?.click()],
              ['🧹 一键清理', openCleanup],
              ['✎ 会议纪要', openMinute],
            ] as const).map(([t, fn]) => (
              <button
                key={t}
                className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-4 py-1.5 font-skcjk text-[11.5px] font-light tracking-[0.1em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                onClick={fn}
              >
                {t}
              </button>
            ))}
            <input ref={fileRef} type="file" multiple hidden accept={DROP_EXTS.join(',')} onChange={(e) => { startOrganize(Array.from(e.target.files || [])); e.target.value = '' }} />
          </div>

          <button
            className="flex w-full cursor-pointer items-center justify-center gap-[9px] rounded-[14px] border-[0.5px] border-dashed border-sk-hair bg-transparent p-3 font-skcjk text-[12.5px] font-light tracking-[0.14em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary [&:hover>span]:translate-x-1"
            onClick={() => setSkillsOpen(true)}
          >
            ▤ 浏览全部技能 <span className="transition-transform duration-200">→</span>
          </button>
        </div>
      </div>

      {/* ── 对话流(二级态):真实成果卡+动作卡 ── */}
      <div className="absolute inset-0 flex-col" style={{ display: view === 'convo' ? 'flex' : 'none' }}>
        <div className="flex flex-none items-center gap-3.5 px-14 pb-3 pt-4">
          <GhostButton onClick={() => setView('hero')}>← 返回营地</GhostButton>
          <Pill tone="pri">{projectName || '未选择项目'}</Pill>
          <Label className="ml-auto">本次会话 · 成果自动归档</Label>
        </div>
        <div ref={scrollRef} className="sk-scroll flex flex-1 flex-col gap-3.5 overflow-y-auto px-14 pb-5 pt-2">
          {msgs.length === 0 && (
            <div className="mt-10 text-center font-skcjk text-[12.5px] font-light text-sk-muted2">从下方输入,或回营地挑一张技能卡开始。</div>
          )}
          {msgs.map((m) => {
            if (m.kind === 'user')
              return (
                <div key={m.id} className="max-w-[82%] self-end rounded-[16px_4px_16px_16px] border-[0.5px] border-[rgba(127,179,207,.18)] bg-[rgba(127,179,207,.09)] px-[18px] py-[13px] font-skcjk text-[13.5px] font-light leading-[1.9] text-sk-fg">
                  {m.text}
                </div>
              )
            if (m.kind === 'hint')
              return (
                <div key={m.id} className="max-w-[88%] self-center rounded-[12px] border-[0.5px] border-dashed border-sk-hair px-3.5 py-2 text-center font-skcjk text-[12px] font-light text-sk-muted">
                  {m.text}
                </div>
              )
            if (m.kind === 'organize') return <OrganizeFlowCard key={m.id} p={m.data} onGoKnow={() => onGoBoard(1)} />
            if (m.kind === 'cleanup') return <CleanupFlowCard key={m.id} onGoCleanup={() => { onGoBoard(1); window.dispatchEvent(new CustomEvent('romai:seasky:open-cleanup')) }} />
            if (m.kind === 'minute') return <MinuteFlowCard key={m.id} projectId={projectId} onGoProject={() => onGoBoard(0)} />
            return renderSkillCard(m.id, m.data)
          })}
        </div>
        <div className="px-14 pb-[22px]">
          <div className="relative rounded-[18px] border-[0.5px] border-sk-border bg-sk-composer p-4 px-[18px] pb-3 backdrop-blur-[14px] transition-all duration-[250ms] focus-within:border-[rgba(127,179,207,.45)] focus-within:shadow-[0_0_30px_rgba(127,179,207,.1)]">
            {pending && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-[rgba(127,179,207,.1)] px-2.5 py-1 font-skcjk text-[11.5px] font-normal text-sk-primary">
                  已选:{pending.title}
                  <button className="cursor-pointer text-sk-muted2 hover:text-sk-fg" title="取消" onClick={clearPending}>✕</button>
                </span>
                <span className="font-skcjk text-[10.5px] font-light text-sk-muted2">补充要求(可留空),回车确认执行</span>
              </div>
            )}
            <textarea
              ref={convoTaRef}
              className="h-[52px] w-full resize-none border-0 bg-transparent font-skcjk text-[14px] font-light leading-[1.8] tracking-[0.05em] text-sk-fg outline-none placeholder:text-sk-muted2"
              placeholder={pending ? `为「${pending.title}」补充要求…　Enter 确认执行` : '继续布置,或按 / 挑一项能力…　Enter 发送 · Shift+Enter 换行'}
              onChange={(e) => {
                if (e.target.value === '/') { e.target.value = ''; setPaletteOpen(true) }
              }}
              onKeyDown={onConvoKey}
            />
            <div className="mt-2 flex items-center gap-2">
              {([
                ['⬒ 接入', () => fileRef.current?.click()],
                ['🧹 清理', openCleanup],
                ['✎ 纪要', openMinute],
              ] as const).map(([t, fn]) => (
                <button
                  key={t}
                  className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-1 font-skcjk text-[10.5px] font-light tracking-[0.1em] text-sk-muted2 transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                  onClick={fn}
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

      {/* 技能库浮层:真 22 技能(5 类) */}
      <SkillLibraryPanel
        open={skillsOpen}
        onClose={() => setSkillsOpen(false)}
        cats={live.cats}
        loading={live.loading}
        err={live.err}
        onPick={(skillId) => {
          setSkillsOpen(false)
          preSelect(skillId, live.byId[skillId]?.title)
        }}
        onReload={live.reload}
      />

      {/* 命令面板(/ 触发,能力总线确认基座:type-to-filter → 预填 → 发送确认) */}
      <CommandPalette open={paletteOpen} cats={live.cats} onPick={pickFromPalette} onClose={() => setPaletteOpen(false)} />

      {/* 方案评审 · 模式选择(快速/设计委员会 MoA,紫黑同款能力海天化) */}
      {picker && (
        <div
          className="absolute inset-0 z-skoverlay grid place-items-center bg-[rgba(6,8,10,.55)] backdrop-blur-[6px]"
          onClick={() => setPicker(false)}
        >
          <div
            className="sk-hairline-top relative w-[min(440px,92%)] rounded-skcomposer border-[0.5px] border-sk-border bg-[rgba(10,12,14,.94)] p-[22px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-skcjk text-[15px] font-normal tracking-[0.08em] text-sk-fg">方案评审 · 选模式</div>
            <div className="mb-4 mt-1 font-skcjk text-[11.5px] font-light text-sk-muted2">同一份项目认知,两种评图方式。</div>
            <button
              className="mb-2.5 w-full cursor-pointer rounded-[14px] border-[0.5px] border-sk-hair bg-[rgba(242,241,238,.03)] p-3.5 px-4 text-left transition-colors duration-150 hover:border-[rgba(127,179,207,.4)]"
              onClick={() => void runSkill('review', composerText.current.trim())}
            >
              <div className="font-skcjk text-[13.5px] font-normal text-sk-fg">⚡ 快速评审</div>
              <div className="mt-0.5 font-skcjk text-[11.5px] font-light text-sk-muted">单模型,约 3 秒。对话式评审意见。</div>
            </button>
            <button
              className="w-full cursor-pointer rounded-[14px] border-[0.5px] border-[rgba(127,179,207,.45)] bg-[rgba(127,179,207,.08)] p-3.5 px-4 text-left transition-colors duration-150 hover:bg-[rgba(127,179,207,.14)]"
              onClick={() => void runSkill('review', composerText.current.trim(), 'moa')}
            >
              <div className="font-skcjk text-[13.5px] font-normal text-sk-fg">✦ 设计委员会</div>
              <div className="mt-0.5 font-skcjk text-[11.5px] font-light text-sk-muted">
                三位评图人(设计总监/空间/形式)+ 主审整合,约 15–60 秒。出评分+检查清单+跨维度问题。
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

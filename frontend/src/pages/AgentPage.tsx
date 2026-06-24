import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import RichText, { Foldable, JudgmentView, coreLine, parseJudgment, renderInline } from '@/components/RichText'
import type { ChatMessage, ChatSession, KnowledgeHit, ResultSendChannel, Skill, SkillRun, SkillResult, Agent } from '@/types/schemas'

/** 统一对话流条目:聊天气泡 + 技能成果卡按时间混排(成果进对话流,不再分两区)。 */
type FlowItem = { kind: 'msg'; key: string; msg: ChatMessage } | { kind: 'result'; key: string; run: SkillRun }

const EXAMPLES = [
  '帮我做一版方案汇报 PPT',
  '把会议录音转成纪要并排好待办',
  '生成几张退台立面意向图',
  '对这版方案做评审，再对标一个类比项目',
]

/** 生图成果正文拆成「结果说明」+「英文提示词」(提示词默认折叠 + 可复制)。 */
function splitImgContent(content: string): { head: string; prompt: string } {
  const idx = content.indexOf('提示词')
  if (idx < 0) return { head: content, prompt: '' }
  const head = content.slice(0, idx).replace(/[。:：\s]+$/, '')
  const prompt = content.slice(idx).replace(/^提示词[:：]?\s*/, '').trim()
  return { head, prompt }
}

/** 成果卡(进对话流)：核心判断优先、长内容默认折叠、生图提示词折叠可复制、原始 markdown 清洗渲染。 */
function ResultCard({ run, projectId }: { run: SkillRun; projectId: number | null }) {
  const r = run
  const pill =
    r.status === 'ok'
      ? r.model || '已生成'
      : r.status === 'not_configured'
        ? '未配置 AI'
        : r.status === 'no_material'
          ? '无材料'
          : r.status === 'plan'
            ? '规划中'
            : '失败'
  const isImg = r.skill_id === 'img' && r.status === 'ok'
  const img = isImg ? splitImgContent(r.content) : null
  const longText = r.status === 'ok' && !isImg && (r.content || '').length > 200
  return (
    <div className="rescard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="rescard-tag">成果</span>
        <b style={{ fontSize: 14 }}>{r.title}</b>
        <span className={'statpill ' + (r.status === 'ok' ? 'live' : 'demo')} style={{ marginLeft: 'auto' }}>
          {pill}
        </span>
      </div>
      {r.status === 'ok' ? (
        isImg && img ? (
          <>
            {r.image_url && projectId != null && (
              <a href={api.projectImageUrl(projectId, r.image_url)} target="_blank" rel="noreferrer">
                <img
                  src={api.projectImageUrl(projectId, r.image_url)}
                  alt={r.title}
                  style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 8, display: 'block', border: '1px solid var(--line2)' }}
                />
              </a>
            )}
            <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 6 }}>{img.head}</div>
            {img.prompt && (
              <Foldable openLabel="查看提示词" closeLabel="收起提示词">
                <div
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: 12,
                    background: 'var(--panel2)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    margin: '4px 0',
                    fontFamily: 'var(--mono, monospace)',
                  }}
                >
                  {img.prompt}
                </div>
                <button className="anbtn" type="button" onClick={() => navigator.clipboard?.writeText(img.prompt)}>
                  复制 Prompt
                </button>
              </Foldable>
            )}
          </>
        ) : (
          (() => {
            // 判断类成果(方案评审/任务/竞品)有结构化 output_json → 分字段卡;否则清洗渲染
            const j = parseJudgment(r.output_json)
            if (j) return <JudgmentView j={j} />
            return longText ? (
              <Foldable
                summary={<div className="rom-core">{renderInline(coreLine(r.content))}</div>}
                openLabel="展开完整内容"
                closeLabel="收起完整内容"
              >
                <RichText text={r.content} />
              </Foldable>
            ) : (
              <RichText text={r.content} />
            )
          })()
        )
      ) : (
        <div style={{ color: 'var(--mut)', fontSize: 13 }}>
          {r.content}
          {r.error_message && <div style={{ color: 'var(--red)', marginTop: 4 }}>{r.error_message}</div>}
        </div>
      )}
      {r.status === 'ok' && !isImg && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="anbtn" type="button" onClick={() => navigator.clipboard?.writeText(r.content)}>
            复制 Markdown
          </button>
          {r.output_json && (
            <button className="anbtn" type="button" onClick={() => navigator.clipboard?.writeText(r.output_json)}>
              复制 JSON
            </button>
          )}
        </div>
      )}
      {r.sources.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--mut)', marginBottom: 3 }}>出处（{r.sources.length}）</div>
          {r.sources.map((s, j) => (
            <div key={j} style={{ fontSize: 11.5, color: 'var(--mut)' }}>
              <span className="score">{s.kind === 'project_file' ? '项目文件' : '知识库'}</span>{' '}
              <b>{s.title}</b>：{s.snippet}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 归档成果 → 成果卡渲染形状(回查历史时复用 ResultCard)。 */
function archivedToRun(a: SkillResult): SkillRun {
  return {
    skill_id: a.skill_id,
    status: a.status,
    title: a.title,
    content: a.content,
    output_json: a.output_json,
    image_url: a.image_path,
    image_model: a.image_model,
    result_id: a.id,
    sources: [],
    model: a.model,
    error_message: a.error_message,
  }
}

/** 归档列表一行:折叠态只显示标题/状态/时间,点开看完整成果卡。 */
function ArchiveRow({ a, projectId }: { a: SkillResult; projectId: number | null }) {
  const [open, setOpen] = useState(false)
  const when = (a.created_at || '').slice(0, 16).replace('T', ' ')
  const statusLabel =
    a.status === 'ok' ? '已生成' : a.status === 'not_configured' ? '未配置' : a.status === 'no_material' ? '无材料' : a.status === 'error' ? '失败' : a.status
  return (
    <div className="archrow">
      <button type="button" className="archrow-hd" onClick={() => setOpen((v) => !v)}>
        <span style={{ marginRight: 6, color: 'var(--mut)' }}>{open ? '▾' : '▸'}</span>
        <b style={{ fontSize: 13 }}>{a.title || a.skill_id}</b>
        <span className={'statpill ' + (a.status === 'ok' ? 'live' : 'demo')} style={{ marginLeft: 8 }}>
          {statusLabel}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--mut)' }}>{when}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6 }}>
          <ResultCard run={archivedToRun(a)} projectId={projectId} />
        </div>
      )}
    </div>
  )
}

/** 共创营地（AI 工作台）：接入真实 chat API。保留原 ROM-AI composer/bubble 视觉。
 *  未配 key → assistant 显示 not_configured，绝不伪造 AI 回复。 */
export default function AgentPage() {
  const { projects, curId, setCurId, cur } = useProject()
  const [projMenuOpen, setProjMenuOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [curSid, setCurSid] = useState<number | null>(null)
  const [flow, setFlow] = useState<FlowItem[]>([])
  const [text, setText] = useState('')
  const [useKnowledge, setUseKnowledge] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [model, setModel] = useState('DeepSeek')
  const [mode, setMode] = useState('Auto')
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const [lastHits, setLastHits] = useState<KnowledgeHit[]>([])
  const [cognitionInjected, setCognitionInjected] = useState(false)
  const [skills, setSkills] = useState<Skill[]>([])
  const [channels, setChannels] = useState<ResultSendChannel[]>([])
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [runningSkill, setRunningSkill] = useState<string | null>(null)
  // 生图模型(默认 OpenAI gpt-image;可选 Gemini)
  const [imgModel, setImgModel] = useState('gpt-image-1-official')
  const [uploading, setUploading] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [showAllSkills, setShowAllSkills] = useState(false)
  // 斜杠命令 + 归档 + 生图轻确认
  const [commands, setCommands] = useState<{ command: string; skill_id: string; label: string; needs_confirm: boolean }[]>([])
  const [showCmdMenu, setShowCmdMenu] = useState(false)
  const [archive, setArchive] = useState<SkillResult[]>([])
  const [showArchive, setShowArchive] = useState(false)
  const [imgConfirm, setImgConfirm] = useState<{ prompt: string; model: string } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const resultSeq = useRef(0)

  // 成果即时进对话流(append 到底部,像发消息一样);同时项目维度落库已由后端完成。
  const appendResult = (run: SkillRun) => {
    setFlow((f) => [...f, { kind: 'result', key: `r${(resultSeq.current += 1)}`, run }])
  }
  const refreshArchive = useCallback(async (pid: number) => {
    try {
      const d = await api.listSkillResults(pid)
      setArchive(d.items)
    } catch {
      setArchive([])
    }
  }, [])

  // composer「+」添加文件：上传到当前项目（落项目文件，解析后可经知识库被检索/技能调用）
  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许连续选同一文件
    if (!file) return
    if (!cur) {
      setErr('请先在上方「作用于」选择项目，再添加文件。')
      return
    }
    setErr(null)
    setUploading(true)
    try {
      const f = await api.uploadProjectFile(cur.id, file)
      setSendNote(`已添加「${f.filename}」到项目「${cur.name}」（解析状态：${f.parse_status}）`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const loadSessions = useCallback(async () => {
    try {
      const d = await api.listChatSessions()
      setSessions(d.items)
      return d.items
    } catch (e) {
      setErr((e as Error).message)
      return []
    }
  }, [])

  const openSession = useCallback(async (sid: number) => {
    setCurSid(sid)
    try {
      const d = await api.getChatSession(sid)
      setFlow(d.messages.map((m) => ({ kind: 'msg', key: `m${m.id}`, msg: m })))
    } catch (e) {
      setErr((e as Error).message)
    }
  }, [])

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setAiConfigured(s.deepseek_api_key_set)
        setModel(s.deepseek_model || 'DeepSeek')
      })
      .catch(() => setAiConfigured(false))
    api.listSkills().then((d) => setSkills(d.items)).catch(() => setSkills([]))
    api.getResultSendChannels().then(setChannels).catch(() => setChannels([]))
    api.listAgents().then(setAgents).catch(() => setAgents([]))
    api.listSkillCommands().then((d) => setCommands(d.items)).catch(() => setCommands([]))
    loadSessions().then((items) => {
      if (items.length) openSession(items[0].id)
    })
  }, [loadSessions, openSession])

  // 切换作用项目 → 拉该项目历史成果(归档回查)
  useEffect(() => {
    if (cur) refreshArchive(cur.id)
    else setArchive([])
  }, [cur, refreshArchive])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [flow])

  const newSession = async () => {
    setErr(null)
    try {
      const s = await api.createChatSession('新会话')
      await loadSessions()
      setCurSid(s.id)
      setFlow([])
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const send = async (msg?: string) => {
    // 模式路由：选了某个智能助手 → 执行该 Agent（出成果卡），不走普通对话
    const agentForMode = agents.find((a) => a.name === mode)
    if (agentForMode) {
      await runAgentMode(agentForMode.id)
      return
    }
    const content = (msg ?? text).trim()
    if (!content || sending) return
    // 斜杠命令分流(B)：/ppt /会议纪要 /评审 /任务 /竞品 直跑；/出图 轻确认；未知/非命令→普通对话
    if (content.startsWith('/')) {
      await runCommand(content)
      return
    }
    await doChat(content)
  }

  // 普通对话：乐观气泡 → 真实 user+assistant 进对话流（按时间序）。
  const doChat = async (content: string) => {
    setErr(null)
    setShowCmdMenu(false)
    setSending(true)
    let sid = curSid
    try {
      if (sid == null) {
        const s = await api.createChatSession(content.slice(0, 20))
        sid = s.id
        setCurSid(sid)
        await loadSessions()
      }
      const optimistic: ChatMessage = {
        id: -Date.now(),
        session_id: sid,
        role: 'user',
        content,
        status: 'ok',
        error_message: '',
        created_at: new Date().toISOString(),
      }
      setFlow((f) => [...f, { kind: 'msg', key: `m${optimistic.id}`, msg: optimistic }])
      setText('')

      const res = await api.sendMessage(sid, {
        message: content,
        use_knowledge: useKnowledge,
        // 作用于当前项目：选中项目即传 project_id——既限定知识库检索范围(E1)，
        // 也让后端注入该项目【已确认】结构化认知(上下文供给协议)，与知识库开关无关。
        project_id: cur ? cur.id : undefined,
        top_k: 5,
      })
      setAiConfigured(res.ai_configured)
      setModel(res.model || model)
      setLastHits(res.knowledge_hits)
      setCognitionInjected(res.cognition_injected)
      // 用服务端真实消息替换乐观项 + 追加 assistant
      setFlow((f) => [
        ...f.filter((x) => x.key !== `m${optimistic.id}`),
        { kind: 'msg', key: `m${res.user_message.id}`, msg: res.user_message },
        { kind: 'msg', key: `m${res.assistant_message.id}`, msg: res.assistant_message },
      ])
      loadSessions()
    } catch (e) {
      setErr((e as Error).message)
      setFlow((f) => f.filter((x) => !(x.kind === 'msg' && x.msg.id < 0)))
    } finally {
      setSending(false)
    }
  }

  // 斜杠命令：文本类后端直跑落库→进对话流；/出图→轻确认；非命令→回落普通对话(不拦)。
  const runCommand = async (content: string) => {
    if (!cur) {
      setErr('请先在上方「作用于」选择项目，再使用命令。')
      return
    }
    setShowCmdMenu(false)
    setErr(null)
    setSending(true)
    try {
      const res = await api.runCommand(cur.id, content, curSid ?? 0, imgModel)
      if (res.status === 'not_command') {
        setSending(false)
        await doChat(content)
        return
      }
      if (res.status === 'confirm_image') {
        // /出图：不直接生图，弹轻确认(将用[模型]生成[prompt])，防打错字白烧钱白等。
        setImgConfirm({ prompt: res.prompt, model: res.model || imgModel })
        setText('')
        return
      }
      if (res.status === 'result' && res.result) {
        appendResult(res.result)
        setText('')
        refreshArchive(cur.id)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  // /出图 轻确认后真出图：确认框拿到的 prompt 占位(以 '(' 开头)则传空让后端据材料自动生成。
  const confirmImage = async () => {
    const c = imgConfirm
    setImgConfirm(null)
    if (!c || !cur) return
    const input = c.prompt.startsWith('(') ? '' : c.prompt
    setErr(null)
    setRunningSkill('img')
    try {
      const r = await api.runSkill(cur.id, 'img', input, c.model, curSid ?? 0)
      appendResult(r)
      refreshArchive(cur.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunningSkill(null)
    }
  }

  // 执行技能卡 → 成果卡进对话流（围绕当前项目 + 项目级 RAG）。需选中项目；不自动串跑。
  const runSkill = async (skillId: string) => {
    if (!cur) {
      setErr('请先选择作用项目，再执行技能。')
      return
    }
    if (runningSkill) return
    setErr(null)
    setRunningSkill(skillId)
    try {
      // 生图技能带所选模型(默认 OpenAI gpt-image);其它技能 model 忽略
      const model = skillId === 'img' ? imgModel : ''
      const r = await api.runSkill(cur.id, skillId, text.trim(), model, curSid ?? 0)
      appendResult(r)
      refreshArchive(cur.id)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunningSkill(null)
    }
  }

  // 模式路由：Auto→普通对话；选中 Agent 模式→点发送时执行该 Agent → 成果卡进对话流。
  const runAgentMode = async (agentId: string) => {
    if (!cur) {
      setErr('请先选择作用项目，再用智能助手模式。')
      return
    }
    setErr(null)
    setRunningSkill(agentId)
    try {
      const r = await api.runAgent(agentId, cur.id, text.trim())
      // 复用成果卡渲染：AgentRun 形状与 SkillRun 一致（agent_id→skill_id 作展示 id）
      appendResult({ ...r, skill_id: r.agent_id })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setRunningSkill(null)
    }
  }

  return (
    <>
      <div className="ptitle">
        <h1>共创营地</h1>
        <div className="projsel">
          <div className="pick" onClick={() => setProjMenuOpen((v) => !v)} style={{ cursor: projects.length ? 'pointer' : 'default' }}>
            ▾ 作用于 · <b>{cur?.name ?? '（未选择项目）'}</b>
            {aiConfigured === false && (
              <span className="statpill demo" style={{ marginLeft: 8 }}>
                未配置
              </span>
            )}
            {aiConfigured === true && (
              <span className="statpill live" style={{ marginLeft: 8 }}>
                已配置
              </span>
            )}
          </div>
          <div className={'projmenu' + (projMenuOpen ? ' show' : '')}>
            {projects.map((p) => (
              <button
                key={p.id}
                className={'projitem' + (p.id === curId ? ' on' : '')}
                onClick={() => {
                  setCurId(p.id)
                  setProjMenuOpen(false)
                }}
              >
                <div>
                  <div className="pi-name">{p.name}</div>
                  <div className="pi-meta">{p.description || '—'}</div>
                </div>
              </button>
            ))}
            {projects.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--mut)' }}>
                暂无项目，请先在项目中心创建
              </div>
            )}
          </div>
        </div>
        <button className="btn ghost" style={{ marginLeft: 'auto', padding: '7px 13px', fontSize: 12 }} onClick={newSession}>
          ＋ 新建会话
        </button>
      </div>

      {/* 会话列表（横向 chip） */}
      <div className="row" style={{ marginBottom: 14, gap: 8, alignItems: 'center' }}>
        <span className="chip" style={{ background: 'var(--terra-soft)', color: 'var(--terra)', borderColor: 'var(--terra-line)', fontWeight: 600, cursor: 'default' }}>
          ROM-AI 操作台
        </span>
        {sessions.map((s) => (
          <button
            key={s.id}
            className={'chip' + (s.id === curSid ? ' on' : '')}
            style={{ cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => openSession(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div className="card agent-chat-card">
        {aiConfigured === false && (
          <div className="setnote" style={{ marginBottom: 10 }}>
            AI 引擎未配置，请前往设置页配置 DeepSeek API Key。当前发送会返回明确的「未配置」提示，不会伪造回复。
          </div>
        )}

        <div className="composer2" style={{ position: 'relative' }}>
          <textarea
            rows={2}
            placeholder="描述需求，@ 引用项目/文件，/ 使用命令（如 /ppt 做6页、/出图 退台立面）"
            value={text}
            onChange={(e) => {
              const v = e.target.value
              setText(v)
              setShowCmdMenu(/^\/[^\s]*$/.test(v)) // 仅在「/命令」尚未带空格时弹菜单
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowCmdMenu(false)
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                setShowCmdMenu(false)
                send()
              }
            }}
          />
          {showCmdMenu && (
            <div className="cmdmenu">
              <div className="cmdmenu-hd">斜杠命令 · 直接触发技能</div>
              {commands
                .filter((c) => text === '/' || c.command.startsWith(text))
                .map((c) => (
                  <button
                    key={c.command}
                    type="button"
                    className="cmdmenu-it"
                    onClick={() => {
                      setText(c.command + ' ')
                      setShowCmdMenu(false)
                    }}
                  >
                    <b>{c.command}</b>
                    <span style={{ color: 'var(--mut)', marginLeft: 8 }}>{c.label}</span>
                    {c.needs_confirm && <span className="statpill demo" style={{ marginLeft: 'auto' }}>需确认</span>}
                  </button>
                ))}
              {commands.filter((c) => text === '/' || c.command.startsWith(text)).length === 0 && (
                <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--mut)' }}>无匹配命令；回车将作为普通对话发送</div>
              )}
            </div>
          )}
          <div className="ctoolbar">
            <button
              className="ctool"
              title={cur ? `添加文件到项目「${cur.name}」` : '请先选择作用项目'}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? '…' : '+'}
            </button>
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              onChange={onPickFile}
            />
            <button
              className={'ctool' + (useKnowledge ? '' : '')}
              title="启用知识库上下文"
              style={useKnowledge ? { borderColor: 'var(--terra-line)', background: 'var(--terra-soft)', color: 'var(--terra)' } : undefined}
              onClick={() => setUseKnowledge((v) => !v)}
            >
              📚
            </button>
            <div className="engpick">
              ▾ <b>{model}</b>
              <div className="engmenu">
                <button className="on">
                  DeepSeek <span className="ok2">✓</span>
                </button>
                <button disabled>
                  Kimi <span className="soon">暂未接入</span>
                </button>
                <button disabled>
                  ChatGPT <span className="soon">暂未接入</span>
                </button>
                <button disabled>
                  Claude <span className="soon">暂未接入</span>
                </button>
              </div>
            </div>
            <div className="engpick">
              ▾ <b>{mode}</b>
              <div className="engmenu agentmenu">
                <button className={mode === 'Auto' ? 'on' : ''} onClick={() => setMode('Auto')}>
                  Auto · 自动调度<span className="cost">低耗</span>
                </button>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    className={mode === a.name ? 'on' : ''}
                    onClick={() => setMode(a.name)}
                    title={a.status === 'ok' ? a.duty : '规划中 · 执行能力暂未接入'}
                  >
                    {a.name}
                    <span className={'cost' + (a.status === 'ok' ? '' : ' soon')}>
                      {a.status === 'ok' ? '可用' : '规划中'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <span className={'ptbadge' + (aiConfigured === false ? ' low' : '')} title="Agent 使用积分 · 每次发送按所选扣减">
              ⊙ <b>{aiConfigured === false ? 0 : 1000}</b> 分
            </span>
            <span className="cspacer"></span>
            <button className="ctool" title="语音对话（暂未接入）">
              🎤
            </button>
            <button className="btn" disabled={sending} onClick={() => send()}>
              {sending ? '发送中…' : '发送 →'}
            </button>
          </div>
          <div className="dropmask">松开添加文件（任意类型）</div>
        </div>

        <div className="chatlog" ref={logRef} style={flow.length ? { marginTop: 12 } : { display: 'none' }}>
          {flow.map((it) =>
            it.kind === 'result' ? (
              <ResultCard key={it.key} run={it.run} projectId={cur ? cur.id : null} />
            ) : (
              <div key={it.key} className={'bubble ' + (it.msg.role === 'user' ? 'u' : 'a')}>
                {it.msg.status === 'not_configured' ? (
                  <span>
                    ⚠ {it.msg.content}
                    <span className="mini">
                      <span>前往设置页配置 DeepSeek API Key</span>
                    </span>
                  </span>
                ) : it.msg.status === 'error' ? (
                  <span style={{ color: 'var(--red)' }}>
                    ✕ {it.msg.content}
                    {it.msg.error_message && (
                      <span className="mini">
                        <span>{it.msg.error_message}</span>
                      </span>
                    )}
                  </span>
                ) : it.msg.role === 'user' ? (
                  it.msg.content
                ) : (
                  // assistant 普通回复:清洗 markdown 噪音(###/**\/---)渲染为干净排版
                  <RichText text={it.msg.content} />
                )}
              </div>
            ),
          )}
          {sending && <div className="bubble a">…思考中</div>}
        </div>

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

        {cognitionInjected && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink2)' }}>
            <span className="statpill live" style={{ marginRight: 6 }}>已注入项目认知</span>
            本次回答已基于「{cur?.name ?? '当前项目'}」的已确认结构化认知（任务书等）作答。
          </div>
        )}

        {lastHits.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="ct">本次引用的知识库片段（{lastHits.length}）</div>
            {lastHits.map((h) => (
              <div className="hit" key={h.document_id}>
                <span className="score">{h.engine}</span>
                <span className="tx">
                  <b>{h.title}</b>：{h.snippet}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="ex" onClick={() => send(ex)}>
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="ct mt" style={{ paddingLeft: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>可调度技能 · 后台运作</span>
        <button className="anbtn" onClick={() => setShowAllSkills(true)}>＋ 全部技能</button>
      </div>
      <div className="grid3">
        {skills.map((s) => (
          <div
            className="skill"
            key={s.id}
            style={{ textAlign: 'left' }}
          >
            <div className="srow">
              <div className="ic">{s.icon}</div>
              <span className="status">{runningSkill === s.id ? '执行中…' : s.status}</span>
            </div>
            <h4>{s.title}</h4>
            <div className="src">{s.source}</div>
            {s.id === 'img' && (
              <select
                value={imgModel}
                onChange={(e) => setImgModel(e.target.value)}
                style={{ marginTop: 6, fontSize: 11.5, padding: '3px 6px', border: '1px solid var(--line2)', borderRadius: 6, background: 'var(--panel2)', color: 'var(--ink)', width: '100%' }}
                title="生图模型"
              >
                <option value="gpt-image-1-official">OpenAI gpt-image（质量 · 慢）</option>
                <option value="gemini-3-pro-image-preview">Gemini（快 · 便宜）</option>
              </select>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="anbtn"
                type="button"
                disabled={!!runningSkill || !cur}
                title={cur ? '基于当前项目执行，产出成果卡' : '请先选择作用项目'}
                onClick={() => runSkill(s.id)}
              >
                {runningSkill === s.id ? '执行中…' : '执行'}
              </button>
              <button
                className="anbtn"
                type="button"
                title="把示例填入下方输入框（不执行）"
                onClick={() => setText(s.example)}
              >
                填入示例
              </button>
            </div>
          </div>
        ))}
        {skills.length === 0 && (
          <div style={{ color: 'var(--mut)', fontSize: 12, padding: 8 }}>技能目录加载中…</div>
        )}
      </div>

      {/* 成果即时进对话流(上方);此处为「项目成果 · 归档」回查历史——刷新/过几天仍可翻出。默认折叠。 */}
      <div
        className="ct mt"
        style={{ paddingLeft: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setShowArchive((v) => !v)}
      >
        <span>项目成果 · 归档（{archive.length}）{cur ? '' : ' · 选择项目后可查'}</span>
        <button className="anbtn" type="button" onClick={(e) => { e.stopPropagation(); setShowArchive((v) => !v) }}>
          {showArchive ? '收起 ▴' : '展开 ▾'}
        </button>
      </div>
      {showArchive && (
        <div style={{ marginTop: 6 }}>
          {archive.length === 0 ? (
            <div className="empty">
              还没有归档成果。用 <b>/ppt</b>、<b>/会议纪要</b>、<b>/出图</b> 或点技能卡「执行」，成果会即时进对话流，并在此按项目归档。
            </div>
          ) : (
            archive.map((a) => <ArchiveRow key={a.id} a={a} projectId={cur ? cur.id : null} />)
          )}

          {/* 成果外发(预览)：渠道未配只给提示，不伪造发送 */}
          <div className="resbar" style={{ display: 'flex', marginTop: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--mut)' }}>外发预览 · 发送到</span>
            {(channels.length ? channels : [
              { channel: 'wecom', label: '企业微信', configured: false },
              { channel: 'email', label: '邮箱', configured: false },
              { channel: 'wx', label: '个人微信', configured: false },
            ]).map((c) => (
              <button
                key={c.channel}
                className="sendto"
                title={c.configured ? `预览发送到${c.label}` : `${c.label}未配置，请到设置页配置`}
                style={c.configured ? undefined : { opacity: 0.5 }}
                onClick={async () => {
                  if (!c.configured) {
                    setSendNote(`${c.label}未配置，请到设置页配置后再发送（不会伪造发送）`)
                    return
                  }
                  try {
                    const r = await api.previewResultSend('（请选择要发送的成果卡）', c.channel)
                    setSendNote(r.status === 'preview' ? `${c.label}发送预览已就绪` : `${c.label}未配置`)
                  } catch {
                    setSendNote('预览失败')
                  }
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          {sendNote && <div style={{ fontSize: 11.5, color: 'var(--mut)', padding: '6px 2px' }}>{sendNote}</div>}
        </div>
      )}

      {/* 全部技能弹窗：列 /api/skills 六技能完整描述 + 示例，可直接执行 */}
      {showAllSkills && (
        <div className="modal show" onClick={() => setShowAllSkills(false)}>
          <div className="panel" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <span className="ic">▤</span>
              <h3>全部技能（{skills.length}）</h3>
              <button className="mclose" onClick={() => setShowAllSkills(false)}>×</button>
            </div>
            <div className="mbody" style={{ display: 'grid', gap: 10 }}>
              {skills.map((s) => (
                <div key={s.id} style={{ border: '1px solid var(--line2)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <b style={{ fontSize: 14 }}>{s.title}</b>
                    <span className="cspacer" style={{ flex: 1 }}></span>
                    <button
                      className="anbtn"
                      disabled={!!runningSkill || !cur}
                      title={cur ? '基于当前项目执行' : '请先选择作用项目'}
                      onClick={() => {
                        setShowAllSkills(false)
                        runSkill(s.id)
                      }}
                    >
                      执行
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 4 }}>{s.source}</div>
                  <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>示例：{s.example}</div>
                </div>
              ))}
              {skills.length === 0 && <div style={{ color: 'var(--mut)' }}>技能目录加载中…</div>}
            </div>
          </div>
        </div>
      )}

      {/* /出图 轻确认：生图花钱又慢，确认将用[模型]生成[提示词]，防打错字白烧钱白等 */}
      {imgConfirm && (
        <div className="modal show" onClick={() => setImgConfirm(null)}>
          <div className="panel" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <span className="ic">🖼</span>
              <h3>确认生图</h3>
              <button className="mclose" onClick={() => setImgConfirm(null)}>×</button>
            </div>
            <div className="mbody">
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                将用 <b>{imgConfirm.model}</b> 生成方案意向图。生图较慢且按次计费，确认后开始。
              </div>
              <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 4 }}>提示词</div>
              <div
                style={{
                  background: 'var(--panel2)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12.5,
                  whiteSpace: 'pre-wrap',
                  color: imgConfirm.prompt.startsWith('(') ? 'var(--mut)' : 'var(--ink)',
                }}
              >
                {imgConfirm.prompt || '(将据当前项目材料自动生成提示词)'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="anbtn" type="button" onClick={() => setImgConfirm(null)}>
                  取消
                </button>
                <button className="btn" type="button" disabled={runningSkill === 'img'} onClick={confirmImage}>
                  {runningSkill === 'img' ? '生成中…' : '确认生成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import type { ChatMessage, ChatSession, KnowledgeHit, ResultSendChannel, Skill, SkillRun } from '@/types/schemas'

const EXAMPLES = [
  '帮我做一版方案汇报 PPT',
  '把会议录音转成纪要并排好待办',
  '生成几张退台立面意向图',
  '对这版方案做评审，再对标一个类比项目',
]

/** 共创营地（AI 工作台）：接入真实 chat API。保留原 ROM-AI composer/bubble 视觉。
 *  未配 key → assistant 显示 not_configured，绝不伪造 AI 回复。 */
export default function AgentPage() {
  const { projects, curId, setCurId, cur } = useProject()
  const [projMenuOpen, setProjMenuOpen] = useState(false)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [curSid, setCurSid] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [useKnowledge, setUseKnowledge] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [model, setModel] = useState('DeepSeek')
  const [mode, setMode] = useState('Auto')
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null)
  const [lastHits, setLastHits] = useState<KnowledgeHit[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [channels, setChannels] = useState<ResultSendChannel[]>([])
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [results, setResults] = useState<SkillRun[]>([])
  const [runningSkill, setRunningSkill] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
      setMessages(d.messages)
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
    loadSessions().then((items) => {
      if (items.length) openSession(items[0].id)
    })
  }, [loadSessions, openSession])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  const newSession = async () => {
    setErr(null)
    try {
      const s = await api.createChatSession('新会话')
      await loadSessions()
      setCurSid(s.id)
      setMessages([])
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const send = async (msg?: string) => {
    const content = (msg ?? text).trim()
    if (!content || sending) return
    setErr(null)
    setSending(true)
    let sid = curSid
    try {
      if (sid == null) {
        const s = await api.createChatSession(content.slice(0, 20))
        sid = s.id
        setCurSid(sid)
        await loadSessions()
      }
      // 乐观插入 user 气泡
      const optimistic: ChatMessage = {
        id: -Date.now(),
        session_id: sid,
        role: 'user',
        content,
        status: 'ok',
        error_message: '',
        created_at: new Date().toISOString(),
      }
      setMessages((m) => [...m, optimistic])
      setText('')

      const res = await api.sendMessage(sid, {
        message: content,
        use_knowledge: useKnowledge,
        // 作用于当前项目：开启知识库时，按当前项目范围检索（E1 项目级检索，避免混读其他项目）
        project_id: useKnowledge && cur ? cur.id : undefined,
        top_k: 5,
      })
      setAiConfigured(res.ai_configured)
      setModel(res.model || model)
      setLastHits(res.knowledge_hits)
      // 用服务端真实消息替换乐观项 + 追加 assistant
      setMessages((m) => [
        ...m.filter((x) => x.id !== optimistic.id),
        res.user_message,
        res.assistant_message,
      ])
      loadSessions()
    } catch (e) {
      setErr((e as Error).message)
      setMessages((m) => m.filter((x) => x.id > 0))
    } finally {
      setSending(false)
    }
  }

  // 执行技能卡 → 成果卡（围绕当前项目 + 项目级 RAG）。需选中项目；不自动串跑。
  const runSkill = async (skillId: string) => {
    if (!cur) {
      setErr('请先选择作用项目，再执行技能。')
      return
    }
    if (runningSkill) return
    setErr(null)
    setRunningSkill(skillId)
    try {
      const r = await api.runSkill(cur.id, skillId, text.trim())
      setResults((prev) => [r, ...prev]) // 新成果卡置顶
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
      {sessions.length > 0 && (
        <div className="row" style={{ marginBottom: 14, gap: 8 }}>
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
      )}

      <div className="card agent-chat-card">
        <div className="chatlog" ref={logRef} style={messages.length ? undefined : { display: 'none' }}>
          {messages.map((m) => (
            <div key={m.id} className={'bubble ' + (m.role === 'user' ? 'u' : 'a')}>
              {m.status === 'not_configured' ? (
                <span>
                  ⚠ {m.content}
                  <span className="mini">
                    <span>前往设置页配置 DeepSeek API Key</span>
                  </span>
                </span>
              ) : m.status === 'error' ? (
                <span style={{ color: 'var(--red)' }}>
                  ✕ {m.content}
                  {m.error_message && (
                    <span className="mini">
                      <span>{m.error_message}</span>
                    </span>
                  )}
                </span>
              ) : (
                m.content
              )}
            </div>
          ))}
          {sending && <div className="bubble a">…思考中</div>}
        </div>

        {aiConfigured === false && (
          <div className="setnote" style={{ marginBottom: 10 }}>
            AI 引擎未配置，请前往设置页配置 DeepSeek API Key。当前发送会返回明确的「未配置」提示，不会伪造回复。
          </div>
        )}

        <div className="composer2">
          <textarea
            rows={2}
            placeholder="描述需求，@ 引用项目/文件，/ 使用命令"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
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
                {['Auto', '找图小雷达', '材料小帮手', '审图老法师', '翻模小王子', '专家团'].map((m) => (
                  <button
                    key={m}
                    className={mode === m ? 'on' : ''}
                    onClick={() => setMode(m)}
                  >
                    {m === 'Auto' ? 'Auto · 自动调度' : m}
                    <span className={'cost' + (m === '专家团' ? ' hot' : '')}>
                      {m === '专家团' ? '高耗' : '低耗'}
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

        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>错误：{err}</div>}

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
        <button className="anbtn">＋ 全部技能</button>
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

      <div className="ct mt" style={{ paddingLeft: 2 }}>
        成果卡 · 回流项目
      </div>
      <div className="resbar" style={{ display: 'flex' }}>
        <label className="resall">
          <input type="checkbox" disabled />
          全选
        </label>
        <span className="ressel">已选 0 项</span>
        <span className="cspacer"></span>
        <span style={{ fontSize: 11, color: 'var(--mut)' }}>发送到</span>
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
      {sendNote && (
        <div style={{ fontSize: 11.5, color: 'var(--mut)', padding: '6px 2px' }}>{sendNote}</div>
      )}
      <div className="results">
        {results.length === 0 ? (
          <div className="empty">点技能卡「执行」后，生成的成果会出现在这里 →</div>
        ) : (
          results.map((r, i) => (
            <div
              key={i}
              className="card"
              style={{ marginBottom: 10, padding: '12px 14px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <b style={{ fontSize: 14 }}>{r.title}</b>
                <span className={'statpill ' + (r.status === 'ok' ? 'live' : 'demo')}>
                  {r.status === 'ok'
                    ? r.model || '已生成'
                    : r.status === 'not_configured'
                      ? '未配置 AI'
                      : r.status === 'no_material'
                        ? '无材料'
                        : '失败'}
                </span>
              </div>
              {r.status === 'ok' ? (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{r.content}</div>
              ) : (
                <div style={{ color: 'var(--mut)', fontSize: 13 }}>
                  {r.content}
                  {r.error_message && <div style={{ color: 'var(--red)', marginTop: 4 }}>{r.error_message}</div>}
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
          ))
        )}
      </div>
    </>
  )
}

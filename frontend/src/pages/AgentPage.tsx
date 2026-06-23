import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { useProject } from '@/contexts/useProject'
import type { ChatMessage, ChatSession, KnowledgeHit } from '@/types/schemas'

const EXAMPLES = [
  '帮我做一版方案汇报 PPT',
  '把会议录音转成纪要并排好待办',
  '生成几张退台立面意向图',
  '对这版方案做评审，再对标一个类比项目',
]

const SKILLS = [
  { key: 'ppt', icon: '▤', title: 'PPT 大纲生成', src: '读知识库 + 项目数据' },
  { key: 'img', icon: '🖼', title: 'AI 生图 · 意向图', src: 'Prompt 模板 → 即梦 / MJ' },
  { key: 'review', icon: '◷', title: '方案评审', src: '案例策略 + 方法模板比对' },
  { key: 'task', icon: '✓', title: '任务安排生成', src: '→ 写回项目中心 下一步' },
  { key: 'meeting', icon: '🔊', title: '会议纪要', src: '转写 + 甲方诉求转译' },
  { key: 'compete', icon: '◰', title: '竞品分析', src: '读知识库类比项目' },
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
  const logRef = useRef<HTMLDivElement>(null)

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
        // 作用于当前项目：开启知识库时，用项目名为检索加上项目上下文
        knowledge_query: useKnowledge && cur ? `${cur.name} ${content}` : undefined,
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

      <div className="card">
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
            <button className="ctool" title="添加文件 / 文件夹 / Skill">
              +
            </button>
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
        {SKILLS.map((s) => (
          <div className="skill" key={s.key}>
            <div className="srow">
              <div className="ic">{s.icon}</div>
              <span className="status">待命</span>
            </div>
            <h4>{s.title}</h4>
            <div className="src">{s.src}</div>
          </div>
        ))}
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
        <button className="sendto">企业微信</button>
        <button className="sendto">邮箱</button>
        <button className="sendto">个人微信</button>
      </div>
      <div className="results">
        <div className="empty">发送需求后，生成的成果会出现在这里 →</div>
      </div>
    </>
  )
}

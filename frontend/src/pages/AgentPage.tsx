import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import type { ChatMessage, ChatSession, KnowledgeHit } from '@/types/schemas'

const EXAMPLES = [
  '帮我做一版方案汇报 PPT',
  '把会议录音转成纪要并排好待办',
  '生成几张退台立面意向图',
  '对这版方案做评审，再对标一个类比项目',
]

/** 共创营地（AI 工作台）：接入真实 chat API。保留原 ROM-AI composer/bubble 视觉。
 *  未配 key → assistant 显示 not_configured，绝不伪造 AI 回复。 */
export default function AgentPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [curSid, setCurSid] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [useKnowledge, setUseKnowledge] = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [model, setModel] = useState('DeepSeek')
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
          <div className="pick">
            ▾ 引擎 · <b>{model}</b>
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
            <button
              className={'ctool' + (useKnowledge ? '' : '')}
              title="启用知识库上下文"
              style={useKnowledge ? { borderColor: 'var(--terra-line)', background: 'var(--terra-soft)', color: 'var(--terra)' } : undefined}
              onClick={() => setUseKnowledge((v) => !v)}
            >
              📚
            </button>
            <span style={{ fontSize: 11, color: useKnowledge ? 'var(--terra)' : 'var(--mut)' }}>
              {useKnowledge ? '知识库上下文 已开' : '知识库上下文 关'}
            </span>
            <span className="cspacer"></span>
            <button className="btn" disabled={sending} onClick={() => send()}>
              {sending ? '发送中…' : '发送 →'}
            </button>
          </div>
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
    </>
  )
}

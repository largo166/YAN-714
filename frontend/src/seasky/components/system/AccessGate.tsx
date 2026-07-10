import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'

import { api, type AccessStatus } from '@/lib/api'

type GateState = 'loading' | 'locked' | 'open' | 'error'

export function AccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('loading')
  const [status, setStatus] = useState<AccessStatus | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const check = useCallback(async () => {
    setState('loading')
    setError('')
    try {
      const next = await api.accessStatus()
      setStatus(next)
      if (!next.enabled || next.authenticated) setState('open')
      else setState('locked')
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法验证访问权限')
      setState('error')
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await api.accessLogin(password)
      setPassword('')
      setState('open')
    } catch (e) {
      setError(e instanceof Error ? e.message : '访问口令不正确')
    } finally {
      setSubmitting(false)
    }
  }

  if (state === 'open') return <>{children}</>

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#071016] px-6 text-[#f2f1ee]">
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 38%, rgba(75,176,176,.18), transparent 34%), linear-gradient(180deg,#081218 0%,#03070a 100%)',
        }}
      />
      <section className="relative w-full max-w-[420px] border border-white/10 bg-black/30 px-9 py-10 shadow-2xl backdrop-blur-xl">
        <p className="mb-3 text-[10px] tracking-[0.36em] text-[#7bc5c3]">PROJECT INTELLIGENCE CENTER</p>
        <h1 className="font-serif text-[27px] font-normal tracking-[0.04em]">ROM-AI 受保护访问</h1>

        {state === 'loading' && <p className="mt-7 text-sm text-white/55">正在验证访问权限…</p>}

        {state === 'error' && (
          <div className="mt-7">
            <p role="alert" className="text-sm leading-6 text-[#eaa89c]">{error}</p>
            <button type="button" onClick={() => void check()} className="mt-5 border border-white/20 px-5 py-2 text-xs tracking-widest hover:bg-white/10">
              重新连接
            </button>
          </div>
        )}

        {state === 'locked' && !status?.configured && (
          <p role="alert" className="mt-7 text-sm leading-6 text-[#eaa89c]">访问闸已开启，但服务器尚未配置口令。请联系部署管理员。</p>
        )}

        {state === 'locked' && status?.configured && (
          <form className="mt-7" onSubmit={submit}>
            <label htmlFor="romai-access-password" className="block text-xs tracking-[0.18em] text-white/60">访问口令</label>
            <input
              id="romai-access-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-3 w-full border border-white/20 bg-white/[0.04] px-4 py-3 text-sm outline-none transition focus:border-[#79bbb9]"
            />
            {error && <p role="alert" className="mt-3 text-xs text-[#eaa89c]">{error}</p>}
            <button
              type="submit"
              disabled={!password || submitting}
              className="mt-6 w-full border border-[#79bbb9]/50 bg-[#79bbb9]/10 px-4 py-3 text-xs tracking-[0.22em] transition hover:bg-[#79bbb9]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? '正在验证…' : '进入 ROM-AI'}
            </button>
            <p className="mt-5 text-[11px] leading-5 text-white/35">会话仅保存在受保护的浏览器 Cookie 中，到期后需重新验证。</p>
          </form>
        )}
      </section>
    </main>
  )
}

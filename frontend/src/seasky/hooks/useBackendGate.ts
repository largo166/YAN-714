import { useCallback, useEffect, useState } from 'react'

import { api } from '@/lib/api'

import { currentBuildHash } from '../lib/buildInfo'

/* 全局后端连接/版本闸(根治红字反复出现,2026-07-10):
   - 启动先 /health;失败 → status='disconnected' → AppShell 显单一全屏提示,不让各板满屏红字。
   - /health 通过再拉 /api/app/version 比对前端 build hash;不一致 → versionMismatch=true(非阻断顶部横幅)。
   - 只做连接+版本自检,不碰业务数据流。 */

export type BackendStatus = 'checking' | 'ok' | 'disconnected'

export interface BackendGate {
  status: BackendStatus
  /** 后端未连接的可读提示(status='disconnected' 时非空)。 */
  message: string
  /** 前端 build ≠ 后端托管 dist(两者都拿到且不同)。非阻断,顶部横幅提示。 */
  versionMismatch: boolean
  frontHash: string | null
  backHash: string | null
  /** 重试(重新 /health + 版本比对)。 */
  retry: () => void
}

export function useBackendGate(): BackendGate {
  const [status, setStatus] = useState<BackendStatus>('checking')
  const [message, setMessage] = useState('')
  const [versionMismatch, setVersionMismatch] = useState(false)
  const [frontHash, setFrontHash] = useState<string | null>(null)
  const [backHash, setBackHash] = useState<string | null>(null)
  const [ver, setVer] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('checking')
    setVersionMismatch(false)
    ;(async () => {
      try {
        await api.health()
      } catch (e) {
        if (!alive) return
        setStatus('disconnected')
        setMessage((e as Error).message || '后端未连接。请从 http://127.0.0.1:8000/seasky.html 打开本应用。')
        return
      }
      if (!alive) return
      setStatus('ok')
      /* 连接 OK 后做版本自检(失败不影响使用,只跳过比对) */
      try {
        const v = await api.appVersion()
        const front = currentBuildHash()
        if (!alive) return
        setFrontHash(front)
        setBackHash(v.dist_hash)
        /* 两者都拿到且不同才判过期;任一为 null(dev 跑/解析不到)→ 不误报 */
        setVersionMismatch(!!front && !!v.dist_hash && front !== v.dist_hash)
      } catch {
        /* 版本端点失败:静默跳过(连接已 OK,不该因自检失败打扰) */
      }
    })()
    return () => {
      alive = false
    }
  }, [ver])

  const retry = useCallback(() => setVer((v) => v + 1), [])

  return { status, message, versionMismatch, frontHash, backHash, retry }
}

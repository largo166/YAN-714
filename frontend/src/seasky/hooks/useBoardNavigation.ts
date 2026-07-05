import { useCallback, useEffect, useRef, useState } from 'react'

import { LS_KEYS, type BoardIndex, type Phase } from '../lib/constants'
import { installGo, parseEntryUrl } from '../lib/go'
import { lsGet, lsSet } from '../lib/storage'

/**
 * 阶段机 + 板块导航(工程化自母版 film → gate → boards → app)。
 * 入口优先级:?go=N 直达 app > #intro 强制影片 > 已看过/勾选直达/减动效 → gate > 影片。
 */
export function useBoardNavigation() {
  const [entry] = useState(parseEntryUrl)
  const [phase, setPhase] = useState<Phase>(() => {
    if (entry.go != null) return 'app'
    if (entry.forceIntro) return 'film'
    const skip =
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      lsGet(LS_KEYS.skipIntro) === '1' ||
      lsGet(LS_KEYS.seenIntro) === '1'
    return skip ? 'gate' : 'film'
  })
  const [board, setBoard] = useState<BoardIndex>(() => entry.go ?? 0)

  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const toGate = useCallback(() => setPhase('gate'), [])
  const toBoards = useCallback(() => setPhase('boards'), [])
  const enterApp = useCallback((i: BoardIndex) => {
    setBoard(i)
    setPhase('app')
    lsSet(LS_KEYS.board, String(i))
  }, [])
  const switchBoard = useCallback((i: BoardIndex) => {
    setBoard(i)
    lsSet(LS_KEYS.board, String(i))
  }, [])

  /* 调试/回归入口:window.__go + window.__phase(开发与生产同挂) */
  useEffect(() => {
    return installGo(
      {
        app: (i) => enterApp(Math.min(4, Math.max(0, Math.floor(i))) as BoardIndex),
        board: (i) => switchBoard(Math.min(4, Math.max(0, Math.floor(i))) as BoardIndex),
        gate: () => setPhase('gate'),
        boards: () => setPhase('boards'),
      },
      () => phaseRef.current,
    )
  }, [enterApp, switchBoard])

  return { phase, board, entryGo: entry.go, toGate, toBoards, enterApp, switchBoard }
}

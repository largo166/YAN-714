import { useCallback, useEffect, useRef, useState } from 'react'

import { LS_KEYS, type BoardIndex, type Phase } from '../lib/constants'
import { installGo, parseEntryUrl } from '../lib/go'
import { lsSet } from '../lib/storage'

/**
 * 阶段机 + 板块导航(film → boards → app)。
 * 入口优先级:?go=N 直达 app > 减动效 → boards(晕动症红线) > 影片。
 * 每次开机都播(2026-07-09 换版决议)——「已看过/勾选直达」记忆退役;skip 随时可跳兜底。
 */
export function useBoardNavigation() {
  const [entry] = useState(parseEntryUrl)
  const [phase, setPhase] = useState<Phase>(() => {
    if (entry.go != null) return 'app'
    /* 减动效人群不进影片(无障碍优先,红线保留) */
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'boards' : 'film'
  })
  const [board, setBoard] = useState<BoardIndex>(() => entry.go ?? 0)

  const phaseRef = useRef(phase)
  phaseRef.current = phase

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
        /* 兼容旧回归命令，但口令闸已取消：一律转五板选择。 */
        gate: () => setPhase('boards'),
        boards: () => setPhase('boards'),
      },
      () => phaseRef.current,
    )
  }, [enterApp, switchBoard])

  return { phase, board, entryGo: entry.go, toBoards, enterApp, switchBoard }
}

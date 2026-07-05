import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from '../../lib/gsapSetup'

import { BOARD_STATUS, LS_KEYS, type BoardIndex } from '../../lib/constants'
import { energy, horizonY, sweepOnce, trigWave } from '../../lib/seaUniforms'
import { lsSet } from '../../lib/storage'
import { useBoardNavigation } from '../../hooks/useBoardNavigation'
import { useCaptureMode } from '../../hooks/useCaptureMode'
import { useProjectBridge } from '../../services/projectBridge'
import { AgentCampBoard } from '../boards/AgentCampBoard'
import { CockpitBoard } from '../boards/CockpitBoard'
import { HubBoard } from '../boards/HubBoard'
import { KnowledgeBaseBoard } from '../boards/KnowledgeBaseBoard'
import { ProjectCenterBoard } from '../boards/ProjectCenterBoard'
import { BoardFrame } from './BoardFrame'
import { BoardsSelect } from './BoardsSelect'
import { GateScene } from './GateScene'
import { IntroFilm } from './IntroFilm'
import { SeaCanvas } from './SeaCanvas'
import { CineLayer, SkipIntro, useFluidStage } from './SkipIntro'
import { StatusBar, TopNavCapsules } from './TopNavCapsules'
import { SettingsOverlay } from '../system/SettingsOverlay'

/* ═══ 应用外壳:阶段机 film → gate → boards → app(母版等价) ═══ */

export function AppShell() {
  const stageRef = useFluidStage()
  const capture = useCaptureMode()
  const nav = useBoardNavigation()
  const proj = useProjectBridge()
  const [filmPaused, setFilmPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const appRef = useRef<HTMLDivElement>(null)
  const enteredRef = useRef(false)

  const { phase, board } = nav

  /* app 相进入:海平线抬升+深水静场(晕动症红线)+ nav/status 入场 */
  useEffect(() => {
    if (phase !== 'app') {
      enteredRef.current = false
      return
    }
    if (enteredRef.current) return
    enteredRef.current = true
    if (capture) {
      horizonY.v = 0.615
      energy.v = 0.18
      return
    }
    sweepOnce(gsap)
    gsap.to(horizonY, { v: 0.615, duration: 1.4, ease: 'premium' })
    gsap.to(energy, { v: 0.18, duration: 1.8, ease: 'premium' })
    const root = appRef.current
    if (root) {
      gsap.fromTo(root.querySelector('nav'), { y: -46 }, { y: 0, duration: 0.7, ease: 'premium' })
    }
  }, [phase, capture])

  /* app 相切板块的横扫+涟漪 */
  const prevBoard = useRef<BoardIndex>(board)
  useEffect(() => {
    if (phase !== 'app') return
    if (prevBoard.current !== board) {
      prevBoard.current = board
      if (!capture) {
        sweepOnce(gsap)
        trigWave(0.35, 0.62, 0.07)
      }
    }
  }, [board, phase, capture])

  /* 键盘路由(母版等价):film=Space暂停/Esc跳过;app=1-5 切板块(输入框守卫) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'film') {
        if (e.code === 'Space') {
          e.preventDefault()
          setFilmPaused((p) => !p)
        }
        if (e.code === 'Escape') {
          lsSet(LS_KEYS.seenIntro, '1')
          nav.toGate()
        }
        return
      }
      if (phase === 'app') {
        const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea') return
        const n = '12345'.indexOf(e.key)
        if (n >= 0) nav.switchBoard(n as BoardIndex)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [phase, nav])

  const statusLeft = board === 0
    ? (proj.cur ? `${proj.cur.name} · ${proj.cur.status || '进行中'}` : '项目加载中…')
    : BOARD_STATUS[board]

  const enterFromBoards = useCallback((i: BoardIndex) => nav.enterApp(i), [nav])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div ref={stageRef} className="relative h-[720px] w-[1280px] origin-center overflow-hidden bg-sk-bg">
        <SeaCanvas />
        {/* scrim */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              'radial-gradient(ellipse 85% 80% at 42% 50%, rgba(10,12,14,.6), rgba(10,12,14,.24) 55%, rgba(10,12,14,0))',
          }}
        />

        {phase === 'film' && (
          <>
            <IntroFilm paused={filmPaused} onComplete={nav.toGate} onProgress={setProgress} />
            {/* 进度条 + hint + Skip(首帧即出) */}
            <div className="absolute bottom-0 left-0 z-[70] h-0.5 w-full bg-[rgba(242,241,238,.05)]">
              <i className="block h-full bg-sk-primary" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="absolute bottom-3.5 right-[22px] z-[70] font-sans text-[9px] tracking-[0.3em] text-[rgba(242,241,238,.2)]">
              SPACE 暂停 · ESC 跳过
            </div>
            <SkipIntro
              onSkip={() => {
                nav.toGate()
              }}
            />
          </>
        )}

        {phase === 'gate' && <GateScene onUnlock={nav.toBoards} />}
        {phase === 'boards' && <BoardsSelect onEnter={enterFromBoards} />}

        {/* app 壳:五板块恒挂载 display 切换 */}
        <div ref={appRef} className="absolute inset-0 z-[8]" style={{ display: phase === 'app' ? 'block' : 'none' }}>
          <TopNavCapsules board={board} onSwitch={nav.switchBoard} onOpenSettings={() => setSettingsOpen(true)} />
          <BoardFrame active={phase === 'app' && board === 0} skipAnim={capture}>
            <ProjectCenterBoard proj={proj} active={phase === 'app' && board === 0} />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 1} skipAnim={capture}>
            <KnowledgeBaseBoard active={phase === 'app' && board === 1} />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 2} skipAnim={capture}>
            <AgentCampBoard
              projectId={proj.cur?.id ?? null}
              projectName={proj.cur?.name ?? ''}
              onGoBoard={(i) => nav.switchBoard(i as BoardIndex)}
            />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 3} skipAnim={capture}>
            <HubBoard active={phase === 'app' && board === 3} />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 4} skipAnim={capture}>
            <CockpitBoard
              active={phase === 'app' && board === 4}
              curIdx={proj.cur ? Math.max(0, proj.projects.findIndex((p) => p.id === proj.cur!.id)) : 0}
              projectIds={proj.projects.map((p) => p.id)}
              projectNames={proj.projects.map((p) => p.name)}
            />
          </BoardFrame>
          <StatusBar left={statusLeft} />
          <SettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>

        <CineLayer hideBars={phase === 'app'} />
      </div>
    </div>
  )
}

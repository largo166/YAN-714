import { useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from '../../lib/gsapSetup'

import { BOARD_STATUS, type BoardIndex } from '../../lib/constants'
import { energy, horizonY, sweepOnce, trigWave } from '../../lib/seaUniforms'
import { useBoardNavigation } from '../../hooks/useBoardNavigation'
import { useBoardLive } from '../../hooks/useBoardLive'
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
import { GlobalSearch } from '../data/GlobalSearch'

/* ═══ 应用外壳:阶段机 film → gate → boards → app(母版等价) ═══ */

export function AppShell() {
  const stageRef = useFluidStage()
  const capture = useCaptureMode()
  const nav = useBoardNavigation()
  const proj = useProjectBridge()
  const boardLive = useBoardLive() /* 汇聚层:状态栏 + b1/b2/b3 单一数据源(hotfix1) */
  const [filmPaused, setFilmPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false) /* P0:Ctrl+K 全局检索 */
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

  /* 键盘路由(母版等价):film=Space暂停/Esc跳过;app=1-5 切板块(输入框守卫);
     P0(2026-07-08):Ctrl/Cmd+K 全局检索(全局意图,输入框聚焦也响应) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'film') {
        if (e.code === 'Space') {
          e.preventDefault()
          setFilmPaused((p) => !p)
        }
        if (e.code === 'Escape') {
          nav.toGate() /* 每次开机都播(2026-07-09):Esc 只跳本次,不记「已看过」 */
        }
        return
      }
      if (phase === 'app') {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault()
          setSearchOpen((o) => !o)
          return
        }
        const tag = ((e.target as HTMLElement)?.tagName || '').toLowerCase()
        if (tag === 'input' || tag === 'textarea') return
        const n = '12345'.indexOf(e.key)
        if (n >= 0) nav.switchBoard(n as BoardIndex)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [phase, nav])

  /* 状态栏左槽:全板真实计数(单一数据源 useBoardLive)——保留原表达方式,数字接真值。
     加载显"…"、空库显真 0、失败显"—"(板内另有可见错误提示)。铁律:无一条静态假数字。 */
  const projLoading = board === 0 && !proj.cur && proj.loading
  /* 计数格式化:loading→"…" / err→"—" / 就绪→真数(0 也是真话) */
  const fmtCount = (loading: boolean, hasErr: boolean, n: number): string =>
    loading ? '…' : hasErr ? '—' : String(n)
  const kb = boardLive.knowledge
  const sk = boardLive.skills
  const hb = boardLive.hub
  const statusLeft =
    board === 0
      ? (proj.cur ? `${proj.cur.name} · ${proj.cur.status || '进行中'}` : proj.err ? `项目加载失败 · ${proj.err}` : proj.loading ? '项目加载中…' : '暂无项目 · 到数据基地接入资料')
      : board === 1
      ? `数据基地 · ${fmtCount(kb.loading, !!kb.err, kb.stats?.documents ?? 0)} 篇受管`
      : board === 2
      ? `共创营地 · ${fmtCount(sk.loading, !!sk.err, sk.skills.length)} 项技能在编`
      : board === 3
      ? `协作平台 · ${fmtCount(hb.loading, hb.errs.length > 0, hb.members.length)} 名成员`
      : BOARD_STATUS[4] /* b4 管理驾驶舱:非数字标签 */
  /* 状态栏 pulse:项目加载 或 当前板计数仍在加载时,给"…"一点呼吸提示 */
  const statusPulse =
    projLoading ||
    (board === 1 && kb.loading) ||
    (board === 2 && sk.loading) ||
    (board === 3 && hb.loading)

  const enterFromBoards = useCallback((i: BoardIndex) => nav.enterApp(i), [nav])

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div ref={stageRef} className="relative h-[720px] w-[1280px] origin-center overflow-hidden bg-sk-bg">
        {/* 影片期不挂常驻海(v12 影片自带粒子海+不透明底,后方 fbm 海全遮挡仍满帧=纯浪费;
            uniforms 是模块单例,gate 相重挂无损契约——对抗审查修) */}
        {phase !== 'film' && <SeaCanvas />}
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
            <KnowledgeBaseBoard active={phase === 'app' && board === 1} live={boardLive.knowledge} />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 2} skipAnim={capture}>
            <AgentCampBoard
              projectId={proj.cur?.id ?? null}
              projectName={proj.cur?.name ?? ''}
              active={phase === 'app' && board === 2}
              live={boardLive.skills}
              onGoBoard={(i) => nav.switchBoard(i as BoardIndex)}
            />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 3} skipAnim={capture}>
            <HubBoard active={phase === 'app' && board === 3} live={boardLive.hub} />
          </BoardFrame>
          <BoardFrame active={phase === 'app' && board === 4} skipAnim={capture}>
            <CockpitBoard
              active={phase === 'app' && board === 4}
              curIdx={proj.cur ? Math.max(0, proj.projects.findIndex((p) => p.id === proj.cur!.id)) : 0}
              projectIds={proj.projects.map((p) => p.id)}
              projectNames={proj.projects.map((p) => p.name)}
            />
          </BoardFrame>
          <StatusBar left={statusLeft} pulse={statusPulse} />
          <SettingsOverlay open={settingsOpen} onClose={() => setSettingsOpen(false)} />
          <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} proj={proj} />
        </div>

        {/* 下拉/浮层 Portal 根:在 stage 内(继承流体缩放 scale)、boards 之上,收纳 DropMenu 展开层——
            使其脱离标题 data-in 入场动画残留 transform 造成的层叠上下文陷阱,而非靠调大 z-index 比大小 */}
        <div id="sk-overlay" className="pointer-events-none absolute inset-0 z-[45]" />

        <CineLayer hideBars={phase === 'app'} />
      </div>
    </div>
  )
}

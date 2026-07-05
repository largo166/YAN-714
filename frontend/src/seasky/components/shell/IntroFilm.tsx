import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

import { boost, energy, order, sweep, trigWave } from '../../lib/seaUniforms'
import { LS_KEYS } from '../../lib/constants'
import { lsSet } from '../../lib/storage'

/* ═══ 开机影片 s0-s6(母版 GSAP 时间线 1:1 迁移) ═══
   影片是命令式编排——GSAP 直驱 DOM,React 只负责挂载结构与生命周期。 */

const Q = 0.6
const S = 1.2
const L = 2.2

interface IntroFilmProps {
  paused: boolean
  onComplete: () => void
  onProgress: (p: number) => void
}

export function IntroFilm({ paused, onComplete, onProgress }: IntroFilmProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  const doneRef = useRef({ onComplete, onProgress })
  doneRef.current = { onComplete, onProgress }

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const q = (sel: string) => root.querySelectorAll(sel)
    const scenes = Array.from(root.querySelectorAll<HTMLElement>('.sk-scene'))

    const tl = gsap.timeline({
      paused: true,
      defaults: { ease: 'premium', duration: S },
      onUpdate: () => doneRef.current.onProgress(tl.progress()),
      onComplete: () => {
        lsSet(LS_KEYS.seenIntro, '1') /* 看完记「已看过」 */
        doneRef.current.onComplete()
      },
    })
    tlRef.current = tl

    const show = (i: number) => () => {
      scenes.forEach((s, j) => (s.style.visibility = j === i ? 'visible' : 'hidden'))
      gsap.killTweensOf(scenes[i])
      gsap.fromTo(scenes[i], { scale: 1 }, { scale: 1.04, duration: 9.5, ease: 'none' })
    }
    const addSweep = () => {
      tl.fromTo(sweep, { x: -0.25, amp: 0.16 }, { x: 1.25, amp: 0.16, duration: 0.9, ease: 'power2.inOut' }, '<').set(
        sweep,
        { amp: 0 },
      )
    }

    /* s0 */
    tl.addLabel('s0')
      .call(show(0))
      .to('#sk-s0 .l1 > span', { y: 0, duration: L * 0.6, onComplete: () => trigWave(0.5, 0.58, 0.09) }, '+=0.8')
      .to(energy, { v: 1.0, duration: L, ease: 'premium' }, '<')
      .to('#sk-s0 .l2 > span', { y: 0, duration: L * 0.6, onComplete: () => trigWave(0.5, 0.5, 0.09) }, '<0.35')
      .to(energy, { v: 0.72, duration: S, ease: 'premium' }, '<0.6')
      .to('#sk-s0 .sub', { opacity: 1, duration: S }, '<0.4')
      .to('#sk-s0 .sub-rule', { width: 52, duration: S }, '<0.2')
      .to('#sk-s0', { opacity: 0, duration: 0.8, ease: 'premiumOut' }, '+=1.85')
    addSweep()
    tl.set('#sk-s0', { clearProps: 'opacity' })

    /* s1:取景器+打字 */
    tl.addLabel('s1')
      .call(show(1))
      .to(energy, { v: 0.5, duration: L, ease: 'premium' }, '<')
      .to({ v: 0 }, { v: 1, duration: L * 0.5 })
      .fromTo(
        '#sk-s1 .bracket',
        { opacity: 0, x: (i: number) => [5, -5, 5, -5][i], y: (i: number) => [5, 5, -5, -5][i] },
        { opacity: 1, x: 0, y: 0, duration: Q, stagger: 0.08 },
        '-=0.85',
      )
      .to('#sk-s1 .meta', { opacity: 1, duration: S * 0.7 }, '-=0.3')
      .to('#sk-cmd', { opacity: 1, duration: S * 0.7 }, '-=0.2')
      .to('#sk-cmd-hint', { opacity: 1, duration: Q }, '-=0.25')

    const word = 'ROM-AI'
    const beats = [0.22, 0.16, 0.2, 0.26, 0.15, 0.19]
    word.split('').forEach((ch, i) => {
      tl.call(
        () => {
          const field = root.querySelector('#sk-field')!
          const wrap = document.createElement('span')
          wrap.className = 'inline-block overflow-hidden h-[46px]'
          const inner = document.createElement('i')
          inner.textContent = ch
          inner.style.cssText = 'display:block;font-style:normal;transform:translateY(105%);color:var(--sk-foreground)'
          wrap.appendChild(inner)
          field.insertBefore(wrap, field.querySelector('.sk-cursor'))
          gsap.to(inner, { y: 0, duration: 0.4, ease: 'premium' })
          trigWave(0.5, 0.51, 0.13)
        },
        undefined,
        `+=${beats[i]}`,
      ).to('#sk-cmd .rule i', { width: (400 * (i + 1)) / word.length, duration: 0.14, ease: 'none' }, '<0.05')
    })

    tl.to('#sk-cmd-hint', { opacity: 0, duration: 0.25, ease: 'premiumOut' }, '+=0.6')
      .to('#sk-s1', { opacity: 0, duration: 0.5, ease: 'premiumOut' }, '+=0.25')
      .to(boost, { v: 1, duration: S * 0.7, ease: 'power2.in' }, '<')
      .call(show(2))
      .to(boost, { v: 0, duration: L, ease: 'premium' })
      .to(order, { v: 1, duration: L * 1.5, ease: 'premium' }, '<')
      .to(energy, { v: 0.3, duration: L * 1.5, ease: 'premium' }, '<')

    /* s2:boot 行+系统标题 */
    tl.addLabel('s2', '-=3')
    tl.to('#sk-s2 .boot div', { opacity: 1, x: 0, duration: Q * 0.6, stagger: 0.4 }, 's2+=0.3')
      .to('#sk-s2 .boot', { opacity: 0, duration: Q, ease: 'premiumOut' }, '+=0.75')
      .to('#sk-s2 .sys-title', { opacity: 1, duration: S })
      .fromTo(
        '#sk-s2 .sys-title h1',
        { scale: 0.94 },
        { scale: 1, duration: L * 0.75, ease: 'premium', onComplete: () => trigWave(0.5, 0.5, 0.1) },
        '<',
      )
      .fromTo('#sk-s2 .sys-title .rule', { scaleX: 0 }, { scaleX: 1, duration: S * 0.7 }, '<0.45')
      .to('#sk-s2 .sys-title p', { opacity: 1, duration: S }, '<0.35')
      .to('#sk-s2', { opacity: 0, duration: 0.8, ease: 'premiumOut' }, '+=1.65')
    addSweep()
    tl.set('#sk-s2', { clearProps: 'opacity' })

    /* s3:生成层/记忆层 */
    tl.addLabel('s3')
      .call(show(3))
      .to('#sk-s3 .m1 > span', { y: 0, duration: S, onComplete: () => trigWave(0.5, 0.6, 0.09) })
      .to(energy, { v: 0.8, duration: S, ease: 'premium' }, '<')
      .to(order, { v: 0.55, duration: S, ease: 'premium' }, '<')
      .to('#sk-s3 .m2 > span', { y: 0, duration: S }, '<0.35')
      .fromTo(
        '#sk-s3 .strata',
        { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: S * 0.85, onComplete: () => trigWave(0.5, 0.36, 0.1) },
        '+=0.7',
      )
      .to(order, { v: 1, duration: L * 0.8, ease: 'premium' }, '<')
      .to(energy, { v: 0.3, duration: L * 0.8, ease: 'premium' }, '<')
      .to('#sk-s3 .stratum .en', { opacity: 1, duration: Q, stagger: 0.13 }, '<0.35')
      .fromTo(
        '#sk-s3 .stratum.mem',
        { boxShadow: 'rgba(127,179,207,0) 0 0 0 0' },
        { boxShadow: 'rgba(127,179,207,.16) 0 0 30px 0', duration: S * 0.7 },
        '+=0.3',
      )
      .to('#sk-s3', { opacity: 0, duration: 0.8, ease: 'premiumOut' }, '+=2')
    addSweep()
    tl.set('#sk-s3', { clearProps: 'opacity' })

    /* s4:容模评档 */
    tl.addLabel('s4')
      .call(show(4))
      .to('#sk-s4 .frame-title', { opacity: 1, duration: S * 0.8 })
      .to('#sk-s4 .sep', { scaleY: 1, duration: S * 0.85, stagger: 0.12, ease: 'power4.inOut' }, '-=0.3')
      .addLabel('glyphs', '-=0.55')
    const glyphX = [0.245, 0.415, 0.585, 0.755]
    q('#sk-s4 .glyph').forEach((g, i) => {
      tl.fromTo(
        g,
        { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: S * 0.8, ease: 'premium', onStart: () => trigWave(glyphX[i], 0.5, 0.11) },
        'glyphs+=' + i * 0.34,
      )
    })
    tl.to('#sk-s4 .en', { opacity: 1, duration: Q, stagger: 0.34 }, 'glyphs+=0.28')
      .to('#sk-s4 .zh', { opacity: 1, duration: Q, stagger: 0.34 }, 'glyphs+=0.4')
      .to('#sk-s4', { opacity: 0, duration: 0.8, ease: 'premiumOut' }, '+=2')
    addSweep()
    tl.set('#sk-s4', { clearProps: 'opacity' })

    /* s5:三卡 */
    tl.addLabel('s5')
      .call(show(5))
      .to(energy, { v: 0.22, duration: L, ease: 'premium' }, '<')
      .addLabel('cards', '+=0.1')
    const cardX = [0.25, 0.5, 0.75]
    q('#sk-s5 .card').forEach((c, i) => {
      tl.fromTo(
        c,
        { opacity: 0, y: 26 },
        { opacity: 1, y: 0, duration: S * 0.8, ease: 'premium', onStart: () => trigWave(cardX[i], 0.5, 0.09) },
        'cards+=' + i * 0.3,
      )
    })
    tl.to('#sk-s5', { opacity: 0, duration: 0.8, ease: 'premiumOut' }, '+=2.3')
    addSweep()
    tl.set('#sk-s5', { clearProps: 'opacity' })

    /* s6:收束 */
    tl.addLabel('s6')
      .call(show(6))
      .to('#sk-s6 .m1 > span', { y: 0, duration: S })
      .to(energy, { v: 0.45, duration: S, ease: 'premium' }, '<')
      .to('#sk-s6 .m2 > span', { y: 0, duration: S, onComplete: () => trigWave(0.5, 0.5, 0.09) }, '<0.35')
      .to('#sk-s6 .mask-line > span', { y: '-112%', duration: S * 0.7, ease: 'premiumOut', stagger: 0.07 }, '+=1.8')
      .to(boost, { v: 0.35, duration: S, ease: 'power2.in' }, '<')
      .to('#sk-s6 .brand', { opacity: 1, duration: S }, '+=0.1')
      .fromTo('#sk-s6 .brand h1', { scale: 0.94 }, { scale: 1, duration: L * 0.8, ease: 'premium' }, '<')
      .to(boost, { v: 0, duration: L, ease: 'premium' }, '<')
      .to(energy, { v: 0.12, duration: L * 1.3, ease: 'premium' }, '<')
      .to('#sk-s6 .brand .rule', { scaleX: 1, duration: S * 0.8, ease: 'power4.inOut' }, '<0.5')
      .to('#sk-s6 .brand p', { opacity: 1, duration: S }, '<0.35')
      .to('#sk-s6', { opacity: 0, duration: 0.9, ease: 'premiumOut' }, '+=1.5')

    tl.play()
    return () => {
      tl.kill()
      tlRef.current = null
    }
  }, [])

  useEffect(() => {
    const tl = tlRef.current
    if (!tl) return
    if (paused) tl.pause()
    else tl.play()
  }, [paused])

  /* 结构:与母版场景 DOM 等价(类名 Tailwind 化;mask 用内联 overflow-hidden + 初始位移) */
  const maskLine = 'overflow-hidden'
  const lineSpan = 'block translate-y-[112%]'
  const filmLine =
    'font-skcjk font-light text-center tracking-[0.14em] [text-indent:0.14em] text-sk-fg leading-[1.7] text-[40px]'
  const bracket = 'bracket absolute w-[18px] h-[18px] border-[rgba(242,241,238,.28)] opacity-0'
  const metaRow = 'meta absolute w-full flex justify-between px-[92px] opacity-0'
  const label = 'font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] [text-indent:0.3em] text-sk-muted2'

  return (
    <div ref={rootRef} className="absolute inset-0">
      {/* s0 */}
      <section id="sk-s0" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className={`l1 ${maskLine}`}>
          <span className={`${lineSpan} ${filmLine}`}>当 AI 时代到来</span>
        </div>
        <div className={`l2 ${maskLine}`}>
          <span className={`${lineSpan} ${filmLine}`}>
            我们如何<span className="sk-accent-text font-medium">选择</span>
          </span>
        </div>
        <div className={`sub mt-11 opacity-0 ${label}`}>When the AI era arrives</div>
        <div className="sub-rule mx-auto mt-6 h-0.5 w-0 bg-sk-primary" />
      </section>

      {/* s1 取景器 */}
      <section id="sk-s1" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className={`${bracket} left-[60px] top-[60px] border-l border-t`} style={{ borderWidth: '1px 0 0 1px' }} />
        <div className={`${bracket} right-[60px] top-[60px]`} style={{ borderWidth: '1px 1px 0 0' }} />
        <div className={`${bracket} bottom-[60px] left-[60px]`} style={{ borderWidth: '0 0 1px 1px' }} />
        <div className={`${bracket} bottom-[60px] right-[60px]`} style={{ borderWidth: '0 1px 1px 0' }} />
        <div className={`${metaRow} top-[66px]`}>
          <span className={label}>Cockpit</span>
          <span className={`${label} text-sk-primary`}>● Memory Layer</span>
        </div>
        <div className={`${metaRow} bottom-[66px]`}>
          <span className={label}>ROM-AI</span>
          <span className={label}>Standby</span>
        </div>
        <div id="sk-cmd" className="z-[5] flex -translate-y-1.5 flex-col items-center gap-[22px] opacity-0">
          <div
            id="sk-field"
            className="flex min-h-[48px] items-baseline gap-0.5 font-sans text-[36px] font-medium tracking-[0.1em]"
          >
            <span className="sk-cursor" />
          </div>
          <div className="rule relative h-0.5 w-[400px] bg-sk-hairsoft">
            <i className="absolute left-0 top-0 block h-full w-0 bg-sk-primary" />
          </div>
          <div id="sk-cmd-hint" className={`mt-7 opacity-0 ${label}`}>
            Enter to Begin
          </div>
        </div>
      </section>

      {/* s2 boot */}
      <section id="sk-s2" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className="boot text-left font-skmono text-[12px] font-light leading-[2.9] tracking-[0.14em] text-sk-muted2">
          <div className="translate-x-[-10px] opacity-0">
            loading memory layer ................ <span className="text-sk-primary">OK</span>
          </div>
          <div className="translate-x-[-10px] opacity-0">
            project cognition · 16 fields ....... <span className="text-sk-primary">OK</span>
          </div>
          <div className="translate-x-[-10px] opacity-0">
            cognition writeback protocol ........ <span className="text-sk-primary">OK</span>
          </div>
          <div className="translate-x-[-10px] opacity-0">
            context supply protocol ............. <span className="text-sk-primary">OK</span>
          </div>
          <div className="translate-x-[-10px] opacity-0">
            容 · 模 · 评 · 档 ................... <span className="text-sk-primary">READY</span>
          </div>
        </div>
        <div className="sys-title absolute text-center opacity-0">
          <h1 className="font-sans text-[80px] font-medium leading-none tracking-[0.04em] [text-indent:0.04em] text-sk-fg">
            ROM-<span className="sk-accent-text">AI</span>
          </h1>
          <div className="rule mx-auto my-[30px] h-0.5 w-16 bg-sk-primary" />
          <p className={`opacity-0 ${label}`}>Architect&apos;s Cognitive Core{'　'}建筑师的认知中枢</p>
        </div>
      </section>

      {/* s3 层理 */}
      <section id="sk-s3" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className={`m1 ${maskLine}`}>
          <span className={`${lineSpan} ${filmLine}`}>AI 能在一夜之间生成一千个方案</span>
        </div>
        <div className={`m2 ${maskLine} mt-1`}>
          <span className={`${lineSpan} ${filmLine}`}>
            却记不住你<span className="sk-accent-text font-medium">昨天的判断</span>
          </span>
        </div>
        <div className="strata mt-[72px] flex items-stretch gap-10 opacity-0">
          <div className="stratum gen sk-hairline-top relative flex w-[290px] flex-col gap-3 rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-[26px] px-7 backdrop-blur-[12px]">
            <div className="name font-skcjk text-[20px] font-normal tracking-[0.1em] text-sk-muted">生成层</div>
            <div className={`en opacity-0 ${label}`}>Generation{'　'}拥挤{'　'}无记忆</div>
          </div>
          <div className="stratum mem sk-hairline-top relative flex w-[290px] flex-col gap-3 rounded-skcard border-[0.5px] border-[rgba(127,179,207,.35)] bg-sk-card p-[26px] px-7 backdrop-blur-[12px]">
            <div className="name font-skcjk text-[20px] font-normal tracking-[0.1em] text-sk-primary">记忆层</div>
            <div className={`en opacity-0 ${label}`}>Memory{'　'}ROM-AI 所在之处</div>
          </div>
        </div>
      </section>

      {/* s4 容模评档 */}
      <section id="sk-s4" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className={`frame-title absolute top-[102px] opacity-0 ${label}`}>
          Operating System for Design Judgment{'　'}一套设计判断的操作系统
        </div>
        <div className="flex items-stretch">
          {(
            [
              ['容', 'Intake', '项目入仓'],
              ['模', 'Generate', '方案生成'],
              ['评', 'Evaluate', '多维评审'],
              ['档', 'Archive', '判断归档'],
            ] as const
          ).map(([glyph, en, zh], i) => (
            <div key={glyph} className="contents">
              {i > 0 && <div className="sep w-px origin-top scale-y-0 self-stretch bg-sk-hairsoft" />}
              <div className="flex flex-col items-center gap-[26px] px-[70px]">
                <div className="glyph font-skcjk text-[88px] font-thin leading-none text-sk-fg opacity-0">{glyph}</div>
                <div className={`en opacity-0 ${label}`}>{en}</div>
                <div className="zh font-skcjk text-[13px] font-medium tracking-[0.24em] [text-indent:0.24em] text-sk-muted opacity-0">
                  {zh}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* s5 三卡 */}
      <section id="sk-s5" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className="flex gap-11">
          {(
            [
              ['01', '项目认知模型', '十六域结构化认知　让系统真正看懂一个项目　而非只是存下文件'],
              ['02', '认知回写', '每一次评审与决策自动沉淀回项目认知　判断不再随汇报结束而蒸发'],
              ['03', '语境供给', '让任何生成式 AI 带着完整的项目记忆开始工作　而不是每次从零开始'],
            ] as const
          ).map(([chip, t, d]) => (
            <div
              key={chip}
              className="card sk-hairline-top relative flex w-[330px] flex-col gap-4 rounded-skcard border-[0.5px] border-sk-border bg-sk-card p-[30px] pb-[34px] opacity-0 backdrop-blur-[12px]"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-sktile border-[0.5px] border-sk-hair font-sans text-[14px] font-medium text-sk-primary">
                {chip}
              </div>
              <div className="mt-3 font-skcjk text-[20px] font-normal tracking-[0.08em] text-sk-fg">{t}</div>
              <div className="font-skcjk text-[13.5px] font-light leading-[2.05] tracking-[0.02em] text-sk-muted">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* s6 收束 */}
      <section id="sk-s6" className="sk-scene invisible absolute inset-0 z-[5] flex flex-col items-center justify-center">
        <div className={`m1 mask-line ${maskLine}`}>
          <span className={`${lineSpan} ${filmLine}`}>让每一次判断</span>
        </div>
        <div className={`m2 mask-line ${maskLine} mt-1`}>
          <span className={`${lineSpan} ${filmLine}`}>
            成为<span className="sk-accent-text font-medium">下一次的起点</span>
          </span>
        </div>
        <div className="brand absolute text-center opacity-0">
          <h1 className="font-sans text-[80px] font-medium leading-none tracking-[0.04em] [text-indent:0.04em] text-sk-fg">
            ROM-<span className="sk-accent-text">AI</span>
          </h1>
          <div className="rule mx-auto my-8 h-0.5 w-16 scale-x-0 bg-sk-primary" />
          <p className={`opacity-0 ${label}`}>Architecture OS{'　'}建筑师的记忆层</p>
        </div>
      </section>
    </div>
  )
}

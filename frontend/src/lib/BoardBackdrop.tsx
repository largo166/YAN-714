import { useEffect, useRef } from 'react'

/** 板块动态背景(统一两形态,2026-07-04):同一紫蓝色调——
 *  dots=点阵波场(工作台:项目中心/共创营地) aurora=静谧光晕(汇总台:数据基地/协作平台/管理驾驶舱,
 *  大片模糊光斑仅做 20s+ 呼吸,零空间位移)。
 *  【晕动症红线,2026-07 用户反馈】禁止连续定向运动——streams(下落光丝)/pulse(滚动心电)/
 *  radar(扫描线)/sparks(游动粒子)/orbits(轨道运转) 全部弃用保留,不得再挂到页面。
 *  新形态只许:静场、慢呼吸透明度、极轻指针视差。
 *  只用于各页 HERO 区(父容器 position:relative,内容自己抬 z-index);
 *  Canvas2D、DPR 上限 2、指针轻视差;prefers-reduced-motion 时完全不画。 */
export type BackdropMode = 'dots' | 'streams' | 'sparks' | 'orbits' | 'radar' | 'pulse' | 'aurora'

const PURPLE = '124,92,255'
const BLUE = '66,165,255'

type Stream = { x: number; y: number; v: number; len: number; w: number; hue: string; a: number }
type Spark = { x: number; y: number; vx: number; vy: number; r: number; hue: string; a: number }
type Orbit = { R: number; th: number; v: number; r: number; hue: string }

const rand = (a: number, b: number) => a + Math.random() * (b - a)

export default function BoardBackdrop({ mode }: { mode: BackdropMode }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const host = cv.parentElement
    const ctx = cv.getContext('2d')
    if (!host || !ctx) return

    let W = 0
    let H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const fit = () => {
      W = host.clientWidth
      H = host.clientHeight
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host)

    let mx = 0.5
    let my = 0.5
    const pm = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      mx = (e.clientX - r.left) / Math.max(1, r.width)
      my = (e.clientY - r.top) / Math.max(1, r.height)
    }
    host.addEventListener('pointermove', pm)

    const streams: Stream[] = mode === 'streams'
      ? Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.0004, 0.0016), len: rand(50, 170), w: rand(0.7, 1.8), hue: Math.random() < 0.6 ? PURPLE : BLUE, a: rand(0.08, 0.24) }))
      : []
    const sparks: Spark[] = mode === 'sparks'
      ? Array.from({ length: 54 }, () => ({ x: Math.random(), y: Math.random(), vx: rand(-0.00025, 0.00025), vy: rand(-0.0002, 0.0002), r: rand(0.9, 2.5), hue: Math.random() < 0.6 ? PURPLE : BLUE, a: rand(0.26, 0.66) }))
      : []
    const orbits: Orbit[] = mode === 'orbits'
      ? Array.from({ length: 9 }, (_, i) => ({ R: rand(0.14, 0.46), th: Math.random() * 6.283, v: rand(0.0006, 0.0018) * (i % 2 ? 1 : -1), r: rand(1.6, 2.6), hue: i % 3 ? PURPLE : BLUE }))
      : []

    let t = 0
    let raf = 0
    const draw = () => {
      t += 1
      ctx.clearRect(0, 0, W, H)
      const ox = (mx - 0.5) * 14
      const oy = (my - 0.5) * 10

      if (mode === 'dots') {
        const gap = 34
        for (let y = gap / 2; y < H; y += gap) {
          for (let x = gap / 2; x < W; x += gap) {
            const w1 = Math.sin(x * 0.012 + t * 0.014) + Math.cos(y * 0.014 + t * 0.011)
            const w2 = Math.sin((x + y) * 0.006 + t * 0.008)
            const a = (0.08 + 0.16 * (w1 + w2 + 2) / 4) * (1 - (y / H) * 0.5)
            const r = 1 + 0.9 * (w2 + 1) / 2
            ctx.fillStyle = `rgba(${(x / W + y / H) % 1 < 0.55 ? PURPLE : BLUE},${a.toFixed(3)})`
            ctx.beginPath()
            ctx.arc(x + ox + Math.sin(y * 0.02 + t * 0.012) * 4, y + oy + w1 * 3, r, 0, 6.283)
            ctx.fill()
          }
        }
      }
      if (mode === 'streams') {
        for (const p of streams) {
          p.y += p.v
          if (p.y > 1.15) { p.y = -0.15; p.x = Math.random() }
          const x = p.x * W + ox * 1.4
          const y = p.y * H
          const g = ctx.createLinearGradient(0, y - p.len, 0, y)
          g.addColorStop(0, `rgba(${p.hue},0)`)
          g.addColorStop(1, `rgba(${p.hue},${p.a})`)
          ctx.fillStyle = g
          ctx.fillRect(x, y - p.len, p.w, p.len)
          ctx.fillStyle = `rgba(${p.hue},${(p.a * 2.2).toFixed(3)})`
          ctx.fillRect(x - 0.5, y - 2, p.w + 1, 2.5)
        }
      }
      if (mode === 'sparks') {
        for (const p of sparks) {
          p.x += p.vx; p.y += p.vy
          if (p.x < 0 || p.x > 1) p.vx *= -1
          if (p.y < 0 || p.y > 1) p.vy *= -1
        }
        for (let i = 0; i < sparks.length; i++) {
          const a = sparks[i]
          const ax = a.x * W + ox
          const ay = a.y * H + oy
          for (let j = i + 1; j < sparks.length; j++) {
            const b = sparks[j]
            const bx = b.x * W + ox
            const by = b.y * H + oy
            const d = Math.hypot(ax - bx, ay - by)
            if (d < 120) {
              ctx.strokeStyle = `rgba(${PURPLE},${(0.16 * (1 - d / 120)).toFixed(3)})`
              ctx.lineWidth = 0.7
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
            }
          }
          ctx.fillStyle = `rgba(${a.hue},${(a.a * 0.8).toFixed(3)})`
          ctx.beginPath(); ctx.arc(ax, ay, a.r, 0, 6.283); ctx.fill()
        }
      }
      if (mode === 'orbits') {
        const cx = W * 0.78 + ox * 2
        const cy = H * 0.42 + oy * 2
        ctx.strokeStyle = 'rgba(255,255,255,.07)'
        ctx.lineWidth = 1
        for (const p of orbits) {
          ctx.beginPath(); ctx.arc(cx, cy, p.R * Math.min(W, H), 0, 6.283); ctx.stroke()
        }
        const pts = orbits.map((p) => {
          p.th += p.v
          const R = p.R * Math.min(W, H)
          return { x: cx + Math.cos(p.th) * R, y: cy + Math.sin(p.th) * R, p }
        })
        pts.forEach((cur, i) => {
          const nxt = pts[(i + 1) % pts.length]
          ctx.strokeStyle = `rgba(${PURPLE},.13)`
          ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(nxt.x, nxt.y); ctx.stroke()
          ctx.fillStyle = `rgba(${cur.p.hue},.7)`
          ctx.beginPath(); ctx.arc(cur.x, cur.y, cur.p.r, 0, 6.283); ctx.fill()
          ctx.fillStyle = `rgba(${cur.p.hue},.18)`
          ctx.beginPath(); ctx.arc(cur.x, cur.y, cur.p.r * 3.2, 0, 6.283); ctx.fill()
        })
      }
      if (mode === 'aurora') {
        // 静谧光晕:三团大模糊光斑,位置固定,只有透明度在 21s/29s/37s 周期上极缓呼吸。
        // 无任何空间位移、无指针视差——数据基地/驾驶舱专用的"安静场"。
        const orbs: Array<[number, number, number, string, number, number]> = [
          [0.22, 0.30, 0.52, PURPLE, 0.11, 0.0030],
          [0.78, 0.22, 0.46, BLUE, 0.085, 0.0022],
          [0.55, 0.85, 0.60, PURPLE, 0.07, 0.0017],
        ]
        for (const [fx, fy, fr, hue, baseA, freq] of orbs) {
          const a = baseA * (0.72 + 0.28 * Math.sin(t * freq))
          const R = fr * Math.max(W, H)
          const g = ctx.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, R)
          g.addColorStop(0, `rgba(${hue},${a.toFixed(3)})`)
          g.addColorStop(1, `rgba(${hue},0)`)
          ctx.fillStyle = g
          ctx.fillRect(0, 0, W, H)
        }
      }
      if (mode === 'pulse') {
        // 心电脉搏线(项目健康监测):两条相位错开的脉搏迹线缓慢左移 + 底部刻度网格。
        const base = H * 0.6 + oy
        ctx.strokeStyle = 'rgba(255,255,255,.045)'
        ctx.lineWidth = 1
        const tickShift = (t * 0.4) % 56
        for (let x = -tickShift; x < W; x += 56) {
          ctx.beginPath(); ctx.moveTo(x, base + 26); ctx.lineTo(x, base + 34); ctx.stroke()
        }
        ctx.beginPath(); ctx.moveTo(0, base + 30); ctx.lineTo(W, base + 30)
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.stroke()
        const beat = (u: number): number => {
          if (u < 0.08) return Math.sin((u / 0.08) * Math.PI) * 6
          if (u < 0.12) return 0
          if (u < 0.145) return -((u - 0.12) / 0.025) * 10
          if (u < 0.17) return -10 + ((u - 0.145) / 0.025) * 58
          if (u < 0.2) return 48 - ((u - 0.17) / 0.03) * 62
          if (u < 0.24) return -14 + ((u - 0.2) / 0.04) * 14
          if (u < 0.4) return Math.sin(((u - 0.24) / 0.16) * Math.PI) * 10
          return 0
        }
        const period = 340
        const trace = (yBase: number, hue: string, alpha: number, phase: number, amp: number) => {
          for (const [lw, a2] of [[6, alpha * 0.12], [1.6, alpha]] as const) {
            ctx.strokeStyle = `rgba(${hue},${a2.toFixed(3)})`
            ctx.lineWidth = lw
            ctx.beginPath()
            for (let x = 0; x <= W; x += 2) {
              const u = (((x + t * 1.1 + phase) % period) + period) % period / period
              const y = yBase - beat(u) * amp + ox * 0.15
              if (x === 0) ctx.moveTo(x, y)
              else ctx.lineTo(x, y)
            }
            ctx.stroke()
          }
        }
        trace(base, PURPLE, 0.5, 0, 0.9)
        trace(base + 22, BLUE, 0.22, 150, 0.55)
      }
      if (mode === 'radar') {
        const cx = W * 0.5 + ox * 2
        const cy = H * 0.55 + oy * 2
        const maxR = Math.max(W, H) * 0.55
        for (let k = 0; k < 3; k++) {
          const r = (t * 0.35 + (k * maxR) / 3) % maxR
          ctx.strokeStyle = `rgba(${PURPLE},${(0.14 * (1 - r / maxR)).toFixed(3)})`
          ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke()
        }
        if (typeof ctx.createConicGradient === 'function') {
          const g = ctx.createConicGradient(t * 0.006, cx, cy)
          g.addColorStop(0, `rgba(${BLUE},.10)`)
          g.addColorStop(0.08, `rgba(${BLUE},0)`)
          g.addColorStop(1, `rgba(${BLUE},0)`)
          ctx.fillStyle = g
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, maxR, 0, 6.283); ctx.fill()
        }
        ctx.fillStyle = `rgba(${PURPLE},.5)`
        ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, 6.283); ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      host.removeEventListener('pointermove', pm)
    }
  }, [mode])

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.9, zIndex: 0 }}
    />
  )
}

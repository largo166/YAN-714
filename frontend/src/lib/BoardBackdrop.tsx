import { useEffect, useRef } from 'react'

/** 板块动态背景(按小样确认,2026-07):同一紫蓝色调、五种形态——
 *  dots=点阵波场(项目中心) streams=数据流(数据基地) sparks=思维粒子(共创营地)
 *  orbits=轨道连线(协作平台) radar=雷达脉冲(管理驾驶舱)。
 *  只用于各页 HERO 区(父容器 position:relative,内容自己抬 z-index);
 *  Canvas2D、DPR 上限 2、指针轻视差;prefers-reduced-motion 时完全不画。 */
export type BackdropMode = 'dots' | 'streams' | 'sparks' | 'orbits' | 'radar'

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
      ? Array.from({ length: 26 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.0004, 0.0016), len: rand(40, 140), w: rand(0.6, 1.6), hue: Math.random() < 0.6 ? PURPLE : BLUE, a: rand(0.05, 0.16) }))
      : []
    const sparks: Spark[] = mode === 'sparks'
      ? Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), vx: rand(-0.00025, 0.00025), vy: rand(-0.0002, 0.0002), r: rand(0.8, 2.2), hue: Math.random() < 0.6 ? PURPLE : BLUE, a: rand(0.18, 0.5) }))
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
            const a = (0.05 + 0.10 * (w1 + w2 + 2) / 4) * (1 - (y / H) * 0.55)
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
            if (d < 110) {
              ctx.strokeStyle = `rgba(${PURPLE},${(0.10 * (1 - d / 110)).toFixed(3)})`
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
        ctx.strokeStyle = 'rgba(255,255,255,.045)'
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
          ctx.strokeStyle = `rgba(${PURPLE},.08)`
          ctx.beginPath(); ctx.moveTo(cur.x, cur.y); ctx.lineTo(nxt.x, nxt.y); ctx.stroke()
          ctx.fillStyle = `rgba(${cur.p.hue},.55)`
          ctx.beginPath(); ctx.arc(cur.x, cur.y, cur.p.r, 0, 6.283); ctx.fill()
          ctx.fillStyle = `rgba(${cur.p.hue},.12)`
          ctx.beginPath(); ctx.arc(cur.x, cur.y, cur.p.r * 3.2, 0, 6.283); ctx.fill()
        })
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

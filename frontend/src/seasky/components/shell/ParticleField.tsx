import { useEffect, useRef } from 'react'

/* ═══ 五板块粒子背景(2026-07-09 已批;替换 SeaCanvas 的可选背景) ═══
   精致粒子场:三层视差星尘 + 冷蓝径向底 + 极慢呼吸 + 克制星座连线。
   比小样再收敛一档(负责人天天盯着干活的界面):粒子更少更淡、速度更慢、连线更稀。
   canvas 2D 轻量(非 three.js);prefers-reduced-motion 或开关关 → 只画一次静态底,不跑 rAF。
   卸载全清 rAF+listener(对抗审查:遮挡/卸载/性能)。 */

const SEED = 20260709

interface P {
  li: number
  x: number
  y: number
  r: number
  ph: number
  vx: number
  vy: number
}

export function ParticleField({ animated = true }: { animated?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    /* 减动效人群 或 开关设为静态 → 不跑动画,只画一次冷蓝底(晕动症红线) */
    const still = !animated || matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 0
    let H = 0
    const dpr = Math.min(devicePixelRatio || 1, 2)
    function resize() {
      const w = Math.max(1, Math.round(cv!.clientWidth * dpr))
      const h = Math.max(1, Math.round(cv!.clientHeight * dpr))
      if (cv!.width !== w || cv!.height !== h) {
        cv!.width = w
        cv!.height = h
      }
      W = cv!.clientWidth
      H = cv!.clientHeight
    }
    resize()

    /* 三层(远/中/近)——比小样收敛:总量降到 ~180,alpha 降一档,速度 ×0.6 */
    const layers = [
      { n: 90, size: [0.4, 0.8], spd: 0.05, alpha: 0.16, glow: 0 },
      { n: 60, size: [0.7, 1.3], spd: 0.10, alpha: 0.30, glow: 0.4 },
      { n: 28, size: [1.2, 2.1], spd: 0.17, alpha: 0.55, glow: 1 },
    ]
    let seed = SEED
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const parts: P[] = []
    layers.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        parts.push({
          li,
          x: rnd() * W,
          y: rnd() * H,
          r: L.size[0] + rnd() * (L.size[1] - L.size[0]),
          ph: rnd() * Math.PI * 2,
          vx: (rnd() - 0.5) * L.spd,
          vy: -L.spd * (0.3 + rnd() * 0.7),
        })
      }
    })
    const nearNodes = parts.filter((p) => p.li === 2).slice(0, 12)

    function paint(t: number) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx!.clearRect(0, 0, W, H)
      /* 冷蓝径向底(呼应开机 scrim,更淡) */
      const g = ctx!.createRadialGradient(W * 0.42, H * 0.5, 0, W * 0.42, H * 0.5, W * 0.72)
      g.addColorStop(0, 'rgba(16,30,48,0.4)')
      g.addColorStop(0.55, 'rgba(12,20,32,0.2)')
      g.addColorStop(1, 'rgba(10,12,14,0)')
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, W, H)

      /* 星座连线(近层,阈值内极淡青线,更稀) */
      ctx!.lineWidth = 0.5
      for (let i = 0; i < nearNodes.length; i++) {
        for (let j = i + 1; j < nearNodes.length; j++) {
          const a = nearNodes[i]
          const b = nearNodes[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < 130) {
            ctx!.strokeStyle = `rgba(127,179,207,${0.06 * (1 - d / 130)})`
            ctx!.beginPath()
            ctx!.moveTo(a.x, a.y)
            ctx!.lineTo(b.x, b.y)
            ctx!.stroke()
          }
        }
      }

      for (const p of parts) {
        const L = layers[p.li]
        if (!still) {
          p.x += p.vx
          p.y += p.vy
          if (p.y < -5) {
            p.y = H + 5
            p.x = rnd() * W
          }
          if (p.x < -5) p.x = W + 5
          if (p.x > W + 5) p.x = -5
        }
        const breathe = still ? 0.8 : 0.6 + 0.4 * Math.sin(t * 0.0006 + p.ph) /* 极慢呼吸 */
        const a = L.alpha * breathe
        if (L.glow > 0) {
          const rg = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5)
          rg.addColorStop(0, `rgba(159,192,218,${a * 0.45 * L.glow})`)
          rg.addColorStop(1, 'rgba(159,192,218,0)')
          ctx!.fillStyle = rg
          ctx!.beginPath()
          ctx!.arc(p.x, p.y, p.r * 5, 0, 6.29)
          ctx!.fill()
        }
        ctx!.fillStyle = `rgba(${215 + 20 * L.glow},229,236,${a})`
        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, 6.29)
        ctx!.fill()
      }
    }

    const onResize = () => resize()
    addEventListener('resize', onResize)

    if (still) {
      paint(0) /* 静态:画一次即可,不占 rAF */
      return () => removeEventListener('resize', onResize)
    }

    let raf = 0
    const frame = (ts: number) => {
      paint(ts)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
    }
  }, [animated])

  /* canvas 替换元素须显式 h-full w-full(P0 尺寸失配教训) */
  return <canvas ref={ref} className="absolute inset-0 z-0 h-full w-full" />
}

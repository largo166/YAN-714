import { useEffect, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  LineBasicMaterial,
  LineSegments,
  LinearSRGBColorSpace,
  MathUtils,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three'

/* ═══ v12 海面地形:three.js 粒子海(开机影片专属背景;2026-07-09 换版已批) ═══
   与共享 seaUniforms(SeaCanvas 的 fbm 海)完全隔离——影片自带局部叙事参数,卸载即释放;
   口令闸之后仍由原 SeaCanvas 接管,AppShell 进 app 相的 horizonY/energy 契约不受影响。
   v12 源注释「海面与叙事参数完全解耦」:海只吃 sweep 横扫与 trigWave 涟漪,
   boost/order/energy 为死读——故此处不设,影片时间线里它们 tween 本地哑对象。 */

export const filmSweep = { x: -0.5, amp: 0 }

interface Slot {
  x: number
  y: number
  t0: number
  a0: number
}
const slots: [Slot, Slot] = [
  { x: 0, y: 0, t0: -9, a0: 0 },
  { x: 0, y: 0, t0: -9, a0: 0 },
]
let slotIdx = 0

/** 局部涟漪(v12 trigWave 等价;x,y 为 GL 坐标,y 自下而上) */
export function filmTrigWave(x: number, y: number, a: number): void {
  slots[slotIdx] = { x, y, t0: performance.now() * 0.001, a0: a }
  slotIdx = 1 - slotIdx
}

function filmSeaReset(): void {
  filmSweep.x = -0.5
  filmSweep.amp = 0
  slots[0] = { x: 0, y: 0, t0: -9, a0: 0 }
  slots[1] = { x: 0, y: 0, t0: -9, a0: 0 }
}

/* Simplex 噪声(v12 内联实现原样移植,种子 20260708 保证同一片海) */
function makeSimplex(): (xin: number, yin: number) => number {
  const grad3 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
  ]
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  let seed = 20260708
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  const F2 = 0.5 * (Math.sqrt(3) - 1)
  const G2 = (3 - Math.sqrt(3)) / 6
  return (xin, yin) => {
    let n0: number, n1: number, n2: number
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 < 0) n0 = 0
    else {
      t0 *= t0
      const g = grad3[perm[ii + perm[jj]] % 12]
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 < 0) n1 = 0
    else {
      t1 *= t1
      const g = grad3[perm[ii + i1 + perm[jj + j1]] % 12]
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 < 0) n2 = 0
    else {
      t2 *= t2
      const g = grad3[perm[ii + 1 + perm[jj + 1]] % 12]
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2)
    }
    return 70 * (n0 + n1 + n2)
  }
}

export function FilmSea({ animated = true }: { animated?: boolean } = {}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    /* 减动效红线 或 静态档:粒子海不跑动画,渲染一帧静止画面(晕动症红线;全线统一背景兜底) */
    const still = !animated || matchMedia('(prefers-reduced-motion: reduce)').matches
    filmSeaReset()

    const renderer = new WebGLRenderer({ canvas: cv, antialias: true, alpha: true })
    renderer.setPixelRatio(1.5) /* v12 固定 1.5:流体舞台 k≈1.5(1080p)时恰好逐像素 */
    /* v12 跑 three r128(无输出色彩变换,Color 存原始 sRGB 分量);0.185 默认开色彩管理会
       整体改变海的调性(lerp 中间调偏移+加性叠加提亮削波)。锁回 r128 语义,逐字节复现 v12。 */
    renderer.outputColorSpace = LinearSRGBColorSpace
    renderer.setClearColor(0x000000, 0)

    const scene = new Scene()
    scene.fog = new Fog(0x0c1620, 15, 42)
    scene.fog.color.setHex(0x0c1620, LinearSRGBColorSpace)
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100)
    camera.position.set(0, 4.4, 15.5)
    camera.lookAt(0, -0.3, 0)

    /* ---- 海面网格(v12 原参数) ---- */
    const W = 46
    const H = 28
    const SEG_X = 220
    const SEG_Y = 130
    const COUNT = (SEG_X + 1) * (SEG_Y + 1)
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)
    const baseXY = new Float32Array(COUNT * 2)
    let vi = 0
    for (let iy = 0; iy <= SEG_Y; iy++) {
      for (let ix = 0; ix <= SEG_X; ix++) {
        const x = (ix / SEG_X - 0.5) * W
        const z = (iy / SEG_Y - 0.5) * H
        positions[vi * 3] = x
        positions[vi * 3 + 2] = z
        baseXY[vi * 2] = x
        baseXY[vi * 2 + 1] = z
        vi++
      }
    }
    const lineIndex: number[] = []
    for (let iy = 0; iy <= SEG_Y; iy++)
      for (let ix = 0; ix < SEG_X; ix++) {
        const a = iy * (SEG_X + 1) + ix
        lineIndex.push(a, a + 1)
      }
    for (let ix = 0; ix <= SEG_X; ix += 6)
      for (let iy = 0; iy < SEG_Y; iy++) {
        const a = iy * (SEG_X + 1) + ix
        lineIndex.push(a, a + SEG_X + 1)
      }

    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    const lineGeo = new BufferGeometry()
    lineGeo.setAttribute('position', new BufferAttribute(positions, 3))
    lineGeo.setAttribute('color', new BufferAttribute(colors, 3))
    lineGeo.setIndex(lineIndex)

    const ptsMat = new PointsMaterial({
      size: 0.045, vertexColors: true, transparent: true, opacity: 0.85,
      blending: AdditiveBlending, depthWrite: false,
    })
    const lineMat = new LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.2,
      blending: AdditiveBlending, depthWrite: false,
    })
    scene.add(new Points(geo, ptsMat))
    scene.add(new LineSegments(lineGeo, lineMat))

    const SN = makeSimplex()

    /* ---- 蓝晒色域(v12;setHex+LinearSRGB=存原始分量,同 r128 语义) ---- */
    const hex = (h: number) => new Color().setHex(h, LinearSRGBColorSpace)
    const cDeepNear = hex(0x101a28)
    const cDeepFar = hex(0x143240)
    const cSeaNear = hex(0x24476a)
    const cSeaFar = hex(0x47799c)
    const cCyan = hex(0x7fb3cf)
    const cIce = hex(0xd7e5ec)
    const tmp = new Color()
    const tmpD = new Color()
    const tmpS = new Color()
    const clamp = MathUtils.clamp

    const glxToWorld = (x: number) => (x - 0.5) * W
    const glyToWorld = (y: number) => (0.5 - y) * H * 0.92

    /* 指针视差(v12) */
    const ptr = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const onPtr = (e: PointerEvent) => {
      ptr.x = e.clientX / innerWidth - 0.5
      ptr.y = e.clientY / innerHeight - 0.5
    }
    addEventListener('pointermove', onPtr)

    /* 流体舞台:画布逻辑尺寸随 stage 变(帧内轻量自检,同 SeaCanvas 惯例)。
       退化视口防呆:clientW/H 夹到 [1,4096],防某些环境(如 1px 宽 headless)算出天文尺寸把 GPU 打爆。 */
    let lastW = 0
    let lastH = 0
    const clampDim = (n: number, fallback: number) => {
      if (!Number.isFinite(n) || n <= 0) return fallback
      return Math.min(n, 4096)
    }
    const resize = () => {
      const cw = clampDim(cv.clientWidth, 1280)
      const ch = clampDim(cv.clientHeight, 720)
      if (cw === lastW && ch === lastH) return
      lastW = cw
      lastH = ch
      renderer.setSize(cw, ch, false)
      camera.aspect = cw / ch
      camera.updateProjectionMatrix()
    }

    let raf = 0
    const frame = (rawTime: number) => {
      resize()
      cur.x += (ptr.x - cur.x) * 0.03
      cur.y += (ptr.y - cur.y) * 0.03
      const now = performance.now() * 0.001
      /* 静态档:锁定一帧时间(不推进海浪/月光带/镜头),渲染一次静止画面 */
      const time = still ? 8000 : rawTime

      /* 恒定节奏:海面与叙事参数解耦,全程不变速不变幅(v12) */
      const flow = 0.62
      const amp = 0.62
      const t = time * 0.00009 * flow * 2.8

      const rings: { wx: number; wz: number; r: number; a: number }[] = []
      for (let s = 0; s < 2; s++) {
        const w = slots[s]
        const e = now - w.t0
        if (e >= 0 && e < 1.8 && w.a0 > 0.001) {
          rings.push({ wx: glxToWorld(w.x), wz: glyToWorld(w.y), r: e * 4.2, a: w.a0 * Math.max(0, 1 - e / 1.6) * 1.6 })
        }
      }
      const sweepX = glxToWorld(filmSweep.x)
      const sweepA = filmSweep.amp

      for (let i = 0; i < COUNT; i++) {
        const x = baseXY[i * 2]
        const z = baseXY[i * 2 + 1]

        /* ① 海浪:恒定三层叠加 */
        let h = SN(x * 0.07 - t * 3.2, z * 0.16 + t * 0.5) * 1.1
        h += SN(x * 0.2 - t * 5.5, z * 0.35) * 0.22
        h += SN(x * 0.5 - t * 9.0, z * 0.7) * 0.05
        h *= amp
        /* 中央压低,给文字留呼吸 */
        const dip = Math.exp(-Math.pow(z * 0.2, 2)) * Math.exp(-Math.pow(x * 0.055, 2))
        h *= 1 - dip * 0.5

        /* ② 涟漪:只留一圈极微光痕 */
        let ringGlow = 0
        for (let s = 0; s < rings.length; s++) {
          const rg = rings[s]
          const d = Math.sqrt((x - rg.wx) * (x - rg.wx) + (z - rg.wz) * (z - rg.wz))
          ringGlow += Math.exp(-Math.pow((d - rg.r) * 0.9, 2)) * rg.a
        }
        positions[i * 3 + 1] = h

        /* ③ 月光带 + 转场横扫 */
        const bandCenter = Math.sin(time * 0.00008) * 14
        let moon = Math.exp(-Math.pow(Math.abs(x - bandCenter) * 0.14, 2))
        moon *= 0.55 + 0.45 * SN(x * 0.12, z * 0.25 + t * 2)
        moon = clamp(moon * 0.72, 0, 1)
        const sw = Math.exp(-Math.pow((x - sweepX) * 0.16, 2)) * sweepA * 3.2

        /* ④ 混色:纵深渐变 → 高度 → 月光/微光/横扫提亮 */
        const depth = clamp((-z + H / 2) / H, 0, 1)
        tmpD.copy(cDeepNear).lerp(cDeepFar, depth)
        tmpS.copy(cSeaNear).lerp(cSeaFar, depth)
        const hf = clamp((h + 1.2) / 2.6, 0, 1)
        tmp.copy(tmpD).lerp(tmpS, hf)
        const lift = clamp(moon * 0.85 + ringGlow * 0.3 + sw, 0, 1)
        tmp.lerp(cCyan, lift)
        tmp.lerp(cIce, clamp(lift * hf * 0.65, 0, 1))
        const gain = 0.95
        colors[i * 3] = tmp.r * 0.9 * gain
        colors[i * 3 + 1] = tmp.g * 0.9 * gain
        colors[i * 3 + 2] = tmp.b * 0.9 * gain
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
      lineGeo.attributes.position.needsUpdate = true
      lineGeo.attributes.color.needsUpdate = true

      /* 呼吸级镜头 + 指针视差 */
      camera.position.x = Math.sin(time * 0.00004) * 1.0 + cur.x * 1.6
      camera.position.y = 4.4 + Math.sin(time * 0.00007) * 0.15 - cur.y * 0.8
      camera.lookAt(0, -0.3, 0)
      renderer.render(scene, camera)
      if (!still) raf = requestAnimationFrame(frame) /* 静态档只画一帧,不占 rAF */
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', onPtr)
      geo.dispose()
      lineGeo.dispose()
      ptsMat.dispose()
      lineMat.dispose()
      renderer.dispose()
    }
  }, [animated])

  /* canvas 替换元素必须显式 h-full w-full(P0 尺寸失配教训);opacity-90=v12 #dither */
  return <canvas ref={ref} className="absolute inset-0 z-0 h-full w-full opacity-90" />
}

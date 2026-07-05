/* ═══ 海面叙事参数(WebGL uniforms 的共享可变单例) ═══
   与母版同构:GSAP 直接 tween 这些对象的 .v,SeaCanvas 每帧读取。
   模块级单例——影片时间线/阶段切换/板块入场都写同一份,画布只读。 */

export const boost = { v: 0 }
export const order = { v: 0 }
export const energy = { v: 0.35 }
export const horizonY = { v: 0.47 } /* 海平线高度(自下而上);壳内抬升到 0.615 */
export const sweep = { x: -0.5, amp: 0 }

export interface WaveSlot {
  x: number
  y: number
  t0: number
  a0: number
}
export const waveSlots: [WaveSlot, WaveSlot] = [
  { x: 0, y: 0, t0: -9, a0: 0 },
  { x: 0, y: 0, t0: -9, a0: 0 },
]
let waveIdx = 0

/** 触发一圈涟漪(母版 trigWave 等价) */
export function trigWave(x: number, y: number, a: number): void {
  waveSlots[waveIdx] = { x, y, t0: performance.now() * 0.001, a0: a }
  waveIdx = 1 - waveIdx
}

/** 层理横扫一次(母版 sweepOnce 等价;gsap 由调用方传入避免循环依赖) */
export function sweepOnce(gsap: typeof import('gsap').gsap): void {
  gsap.fromTo(
    sweep,
    { x: -0.25, amp: 0.16 },
    {
      x: 1.25,
      amp: 0.16,
      duration: 0.9,
      ease: 'power2.inOut',
      onComplete() {
        sweep.amp = 0
      },
    },
  )
}

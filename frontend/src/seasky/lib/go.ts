/* ═══ 调试/回归入口(延续原型回归方式) ═══
   window.__go.app(i) 直达第 i 板块;?go=0~4 URL 直达。
   开发与生产都挂载(体积可忽略,不影响正常使用)。
   #intro 已退役(2026-07-09 换版决议:每次开机都播,无需强制重看入口)。 */

import type { BoardIndex, Phase } from './constants'

export interface GoAPI {
  /** 直达第 i 板块(进入 app 相) */
  app(i: number): void
  /** app 相内切板块 */
  board(i: number): void
  /** 跳到口令闸 */
  gate(): void
  /** 跳到五板块展开页 */
  boards(): void
}

declare global {
  interface Window {
    __go?: GoAPI
    __phase?: () => Phase
  }
}

export function installGo(api: GoAPI, getPhase: () => Phase): () => void {
  window.__go = api
  window.__phase = getPhase
  return () => {
    delete window.__go
    delete window.__phase
  }
}

/** 解析 URL 直达参数:?go=0~4(直达 app 相) */
export function parseEntryUrl(): { go: BoardIndex | null } {
  const m = window.location.href.match(/[?#&]go=(\d)/)
  const go = m ? (Math.min(4, Number(m[1])) as BoardIndex) : null
  return { go }
}

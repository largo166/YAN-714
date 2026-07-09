/* 前端自身 build 哈希(与后端 /api/app/version 的 dist_hash 比对,判断浏览器是否跑着旧前端)。
   Vite 把入口打成 assets/main-<hash>.js;运行时从已加载的 <script src> 解析该哈希。
   dev(5173,无 hash 文件名)或解析不到 → null,调用方跳过版本比对(只做连接检查)。 */

let _cached: string | null | undefined

export function currentBuildHash(): string | null {
  if (_cached !== undefined) return _cached
  _cached = null
  if (typeof document === 'undefined') return _cached
  for (const s of Array.from(document.getElementsByTagName('script'))) {
    const m = s.src.match(/\/main-([A-Za-z0-9_-]+)\.js(?:\?|$)/)
    if (m) {
      _cached = m[1]
      break
    }
  }
  return _cached
}

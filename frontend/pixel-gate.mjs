#!/usr/bin/env node
/* ═══ b2 像素对照闸(闸② · 无人值守自动验收) ═══
   用 pixelmatch+pngjs 对 b2 共创营地 hero(冻结基准板)做像素级比对,漂移 > 阈值即闸不过。
   替代 Playwright(记忆已研判其为重运行时/曾作 MCP 跳过):截图走 Edge headless(纯二进制),
   比对走 pixelmatch(纯 npm 库),等价达成"截图+pixelmatch自动比对"意图,零浏览器驱动新依赖。

   用法:node verify/b2/pixel-gate.mjs <baselinePng> <currentPng> [thresholdPct]
   阈值默认 0.1%(=0.001);漂移比例 = 差异像素数 / 总像素数。
   产出:同目录 diff.png + 打印比例 + 退出码(0 达标 / 1 超阈)。
   注:两图需同尺寸(同 --window-size 截取);WebGL 海面每帧不同,故基准与当前都用 ?capture=1
   跳过入场动画取稳定帧,但海面仍是活的——因此对照聚焦「构图/UI 结构」,海面像素差通过阈值容忍
   (0.1% 对 1920×1080≈2073 像素预算,足够吸收海面抖动,同时能抓出任何真实构图漂移)。 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const [, , baselinePath, currentPath, thrArg] = process.argv
const thresholdPct = thrArg ? Number(thrArg) : 0.1

if (!baselinePath || !currentPath) {
  console.error('用法: node pixel-gate.mjs <baseline.png> <current.png> [thresholdPct=0.1]')
  process.exit(2)
}

const base = PNG.sync.read(readFileSync(baselinePath))
const cur = PNG.sync.read(readFileSync(currentPath))

if (base.width !== cur.width || base.height !== cur.height) {
  console.error(`✗ 尺寸不一致 baseline ${base.width}x${base.height} vs current ${cur.width}x${cur.height} — 无法比对`)
  process.exit(2)
}

const { width, height } = base
const diff = new PNG({ width, height })
/* threshold=每像素颜色差容忍(0.1 较宽,吸收抗锯齿/海面微光);includeAA 关闭抗锯齿单独计数 */
const mismatched = pixelmatch(base.data, cur.data, diff.data, width, height, { threshold: 0.1, includeAA: false })
const totalPx = width * height
const pct = (mismatched / totalPx) * 100

const diffPath = join(dirname(currentPath), 'diff.png')
writeFileSync(diffPath, PNG.sync.write(diff))

const pass = pct <= thresholdPct
const out = [
  `\n═══ b2 像素对照闸 ═══`,
  `baseline : ${baselinePath}`,
  `current  : ${currentPath}`,
  `尺寸     : ${width}x${height} (${totalPx} px)`,
  `差异像素 : ${mismatched}`,
  `漂移比例 : ${pct.toFixed(4)}%  (阈值 ${thresholdPct}%)`,
  `diff 图  : ${diffPath}`,
  `结论     : ${pass ? '达标 ✓ 构图零漂移(阈值内)' : '超阈 ✗ 需回修至达标'}`,
  '__RESULT_JSON__' + JSON.stringify({ mismatched, totalPx, pct, thresholdPct, pass, diffPath }),
  '',
].join('\n')
/* 同步写 fd1 + 立即 exit:规避异步 write 未 flush、及 Windows libuv teardown 崩溃截断输出 */
writeFileSync(1, out)
process.exit(pass ? 0 : 1)


/**
 * dev:clean 前置清理 —— 解决 dev server 长跑 / HMR 缓存脏导致的「tsc/build 通过但浏览器报旧方法不存在」白屏。
 *
 * 做两件事(跨平台,Windows / macOS / Linux 通用):
 *   1) 杀掉占用 5173 端口的旧 vite/node 进程(陈旧 HMR 内存版本的根源)。
 *   2) 删除 node_modules/.vite(Vite 依赖预构建缓存)。
 * 之后由 package.json 的 dev:clean 串联 `vite --force` 重新预构建启动。
 *
 * 本脚本只清进程与缓存,不碰任何业务代码 / 源文件 / 数据。
 */
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const PORT = 5173
const here = dirname(fileURLToPath(import.meta.url))
const viteCacheDir = resolve(here, '..', 'node_modules', '.vite')

function log(msg) {
  console.log(`[dev:clean] ${msg}`)
}

/** 找出占用指定端口的进程 PID(Windows 用 netstat,类 Unix 用 lsof)。 */
function pidsOnPort(port) {
  const isWin = process.platform === 'win32'
  try {
    if (isWin) {
      const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' })
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
          const pid = line.trim().split(/\s+/).pop()
          if (pid && /^\d+$/.test(pid)) pids.add(pid)
        }
      }
      return [...pids]
    }
    const out = execSync(`lsof -t -i :${port} -sTCP:LISTEN`, { encoding: 'utf8' })
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  } catch {
    return [] // 没有占用 / 命令缺失 → 视作无进程
  }
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
    else execSync(`kill -9 ${pid}`, { stdio: 'ignore' })
    log(`已结束占用 :${PORT} 的进程 PID=${pid}`)
  } catch {
    log(`结束 PID=${pid} 失败(可能已退出),忽略`)
  }
}

// 1) 杀端口占用进程
const pids = pidsOnPort(PORT)
if (pids.length === 0) log(`端口 :${PORT} 当前无占用`)
else pids.forEach(killPid)

// 2) 清 Vite 预构建缓存
try {
  rmSync(viteCacheDir, { recursive: true, force: true })
  log(`已清理 ${viteCacheDir}`)
} catch (e) {
  log(`清理 .vite 缓存失败(可忽略): ${e.message}`)
}

log('清理完成 → 即将以 vite --force 启动')

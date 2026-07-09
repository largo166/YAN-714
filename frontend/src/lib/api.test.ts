/** api.ts 防呆测试(根治红字反复出现,2026-07-10):
 * - resolveApiBase:5173/4173 → 8000;8000/其他 → 同源。
 * - request():连不到后端时给"人话",不再抛 "Unexpected token '<'":
 *   ① fetch 网络失败 → 后端未连接文案;② 200 但返回 HTML(SPA 回退) → 后端未连接文案;
 *   ③ 正常 JSON → 照常返回;④ 非 2xx JSON → API 状态错误(保留原行为)。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, resolveApiBase } from './api'

describe('resolveApiBase · 端口→后端映射(防呆)', () => {
  const origWin = globalThis.window
  const setPort = (port: string) => {
    // @ts-expect-error 测试注入 location
    globalThis.window = { location: { port } }
  }
  afterEach(() => {
    globalThis.window = origWin
  })

  it('5173(dev) → 打 8000 后端', () => {
    setPort('5173')
    expect(resolveApiBase()).toBe('http://127.0.0.1:8000')
  })
  it('4173(vite preview) → 打 8000 后端(此前落同源→满屏红字的根因)', () => {
    setPort('4173')
    expect(resolveApiBase()).toBe('http://127.0.0.1:8000')
  })
  it('8000(后端同源托管 dist) → 同源空串', () => {
    setPort('8000')
    expect(resolveApiBase()).toBe('')
  })
  it('其他端口(exe/未知) → 同源空串', () => {
    setPort('')
    expect(resolveApiBase()).toBe('')
  })
})

describe('request() · 连不到后端给人话(不抛 Unexpected token)', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('fetch 网络失败 → "后端未连接"人话', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api.health()).rejects.toThrow(/后端未连接/)
  })

  it('200 但返回 HTML(SPA 回退首页) → "后端未连接"人话,而非 Unexpected token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => '<!doctype html><html><head></head></html>',
      json: async () => {
        throw new SyntaxError("Unexpected token '<'")
      },
    } as unknown as Response)
    await expect(api.health()).rejects.toThrow(/后端未连接/)
    await expect(api.health()).rejects.not.toThrow(/Unexpected token/)
  })

  it('正常 JSON → 照常解析返回', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ status: 'ok', service: 'rom-ai-backend', database: 'sqlite' }),
    } as unknown as Response)
    await expect(api.health()).resolves.toMatchObject({ status: 'ok' })
  })

  it('非 2xx JSON → 保留 API 状态错误(不被防呆吞掉)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ detail: '服务器炸了' }),
    } as unknown as Response)
    await expect(api.health()).rejects.toThrow(/API 500: 服务器炸了/)
  })
})

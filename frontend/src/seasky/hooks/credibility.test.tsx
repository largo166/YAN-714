/** 封板可信度包行为测试(2026-07-08):错误不静默 + 两个新事件闭环。
 * 口径:mock services 层,断言 hook 状态/重拉行为——组件级测试守状态逻辑(验证成本红线选型)。 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/* ── mocks(vi.hoisted:工厂变量须先于 vi.mock 提升) ── */
const h = vi.hoisted(() => ({
  hub: {
    listTeamMembers: vi.fn(),
    listClients: vi.fn(),
    listAgents: vi.fn(),
    listBroadcasts: vi.fn(),
    createTeamMember: vi.fn(),
    getClientPortrait: vi.fn(),
  },
  api: { listProjects: vi.fn(), updateProject: vi.fn() },
}))

vi.mock('../services', () => ({ hubService: h.hub }))
vi.mock('@/lib/api', () => ({ api: h.api }))

import { useHubLive } from './useHubLive'
import { useProjectBridge } from '../services/projectBridge'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('useHubLive · 错误不静默(封板可信度)', () => {
  it('四源任一失败 → err 非空且点名失败源', async () => {
    h.hub.listTeamMembers.mockRejectedValue(new Error('boom'))
    h.hub.listClients.mockResolvedValue({ items: [] })
    h.hub.listAgents.mockResolvedValue([])
    h.hub.listBroadcasts.mockResolvedValue([])
    const { result } = renderHook(() => useHubLive(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.err).toMatch(/成员/)
  })

  it('四源全成功 → err 为 null', async () => {
    h.hub.listTeamMembers.mockResolvedValue([])
    h.hub.listClients.mockResolvedValue({ items: [] })
    h.hub.listAgents.mockResolvedValue([])
    h.hub.listBroadcasts.mockResolvedValue([])
    const { result } = renderHook(() => useHubLive(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.err).toBeNull()
  })

  it('romai:broadcast-updated → 重拉 broadcasts(驾驶舱发通知协作板即时更新)', async () => {
    h.hub.listTeamMembers.mockResolvedValue([])
    h.hub.listClients.mockResolvedValue({ items: [] })
    h.hub.listAgents.mockResolvedValue([])
    h.hub.listBroadcasts.mockResolvedValue([])
    const { result } = renderHook(() => useHubLive(true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(h.hub.listBroadcasts).toHaveBeenCalledTimes(1)

    h.hub.listBroadcasts.mockResolvedValue([{ id: 1, text: '新通知', created_at: '2026-07-08' }])
    act(() => {
      window.dispatchEvent(new CustomEvent('romai:broadcast-updated'))
    })
    await waitFor(() => expect(h.hub.listBroadcasts).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.broadcasts[0]?.text).toBe('新通知'))
  })
})

describe('projectBridge · romai:projects-updated(修入库新项目切换器看不见)', () => {
  it('派发事件 → listProjects 被再次调用,新项目可见', async () => {
    h.api.listProjects.mockResolvedValue({ items: [{ id: 1, name: '老项目' }] })
    const { result } = renderHook(() => useProjectBridge())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(h.api.listProjects).toHaveBeenCalledTimes(1)
    expect(result.current.projects).toHaveLength(1)

    h.api.listProjects.mockResolvedValue({ items: [{ id: 1, name: '老项目' }, { id: 2, name: '入库新建项目' }] })
    act(() => {
      window.dispatchEvent(new CustomEvent('romai:projects-updated'))
    })
    await waitFor(() => expect(h.api.listProjects).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.projects).toHaveLength(2))
  })
})

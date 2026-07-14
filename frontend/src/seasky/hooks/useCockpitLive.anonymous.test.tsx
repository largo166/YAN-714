import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cockpit: {
    adminStatus: vi.fn(),
    adminSetup: vi.fn(),
    adminLogin: vi.fn(),
    getAiUsage: vi.fn(),
    getWorkload: vi.fn(),
    getBossDashboard: vi.fn(),
    listBroadcasts: vi.fn(),
    listMilestones: vi.fn(),
    createBroadcast: vi.fn(),
  },
}))

vi.mock('../services', () => ({ cockpitService: h.cockpit }))

import { useCockpitLive } from './useCockpitLive'

beforeEach(() => {
  vi.clearAllMocks()
  h.cockpit.adminStatus.mockResolvedValue({ configured: true })
  h.cockpit.getAiUsage.mockResolvedValue([])
  h.cockpit.getWorkload.mockResolvedValue([])
  h.cockpit.getBossDashboard.mockResolvedValue({})
  h.cockpit.listBroadcasts.mockResolvedValue([])
})

describe('useCockpitLive · 取消管理口令', () => {
  it('进入驾驶舱直接拉真实数据，不查询或输入管理口令', async () => {
    const { result } = renderHook(() => useCockpitLive(true, []))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.gate).toBe('open')
    expect(h.cockpit.adminStatus).not.toHaveBeenCalled()
    expect(h.cockpit.getBossDashboard).toHaveBeenCalledTimes(1)
  })
})

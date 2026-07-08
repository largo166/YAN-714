/** useProjectLive 封板可信度测试:无项目 loading 落地 + 逐源记错(错误≠空态)。 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  ps: {
    overview: vi.fn(),
    progress: vi.fn(),
    milestones: vi.fn(),
    risks: vi.fn(),
    latestAnalyses: vi.fn(),
  },
}))
vi.mock('../services', () => ({ projectService: h.ps }))

import { useProjectLive } from './useProjectLive'

beforeEach(() => vi.clearAllMocks())

describe('useProjectLive · 封板可信度', () => {
  it('projectId=null → loading 落地 false(数字区显—而非…永挂)', async () => {
    const { result } = renderHook(() => useProjectLive(true, null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.err).toBeNull()
    expect(h.ps.overview).not.toHaveBeenCalled()
  })

  it('单源失败 → err 点名该源(不再伪装成空态)', async () => {
    h.ps.overview.mockResolvedValue({ files: 1, meetings: 0, minutes: 0, todos: 0 })
    h.ps.progress.mockResolvedValue({ pct: 50 })
    h.ps.milestones.mockRejectedValue(new Error('down'))
    h.ps.risks.mockResolvedValue([])
    h.ps.latestAnalyses.mockResolvedValue({ items: [] })
    const { result } = renderHook(() => useProjectLive(true, 1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.err).toMatch(/里程碑/)
    expect(result.current.overview).not.toBeNull() // 成功源正常供数
  })

  it('四源全败 → 后端不可达口径', async () => {
    for (const k of ['overview', 'progress', 'milestones', 'risks'] as const) h.ps[k].mockRejectedValue(new Error('x'))
    h.ps.latestAnalyses.mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useProjectLive(true, 1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.err).toMatch(/后端不可达/)
  })
})

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBoardNavigation } from './useBoardNavigation'

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  })
}

beforeEach(() => {
  history.replaceState({}, '', '/')
  setReducedMotion(false)
})

describe('useBoardNavigation · 取消口令闸', () => {
  it('减动效用户跳过影片后直接进入五板选择，不再进口令页', () => {
    setReducedMotion(true)
    const { result } = renderHook(() => useBoardNavigation())
    expect(result.current.phase).toBe('boards')
  })

  it('旧调试入口 gate 也重定向五板选择，不能复活密码输入', () => {
    const { result } = renderHook(() => useBoardNavigation())
    act(() => window.__go?.gate())
    expect(result.current.phase).toBe('boards')
  })
})

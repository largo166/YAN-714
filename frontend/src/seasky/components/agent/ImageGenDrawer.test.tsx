/** ImageGenDrawer 状态机测试(2026-07-10 拍板 1A/2A/3B):
 * 锁:①用途闸——不选用途不放行(确认钮禁用+警示);②AI 扩写走 runCommand(/出图)预填草案;
 * ③确认生成按张数并行 N 次 runSkill('img'),每槽独立结算;④单槽失败如实呈现+可重试;
 * ⑤成图后派发 romai:assets-updated(事件命名约定)。 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  cs: {
    listAssets: vi.fn(),
    assetThumbUrl: vi.fn(() => 'thumb.jpg'),
    projectImageUrl: vi.fn((_p: number, path: string) => `/img/${path}`),
    runCommand: vi.fn(),
    runSkill: vi.fn(),
  },
}))
vi.mock('../../services', () => ({ campService: h.cs }))

import { ImageGenDrawer } from './ImageGenDrawer'

function mountOpen(projectId: number | null = 3) {
  const overlay = document.createElement('div')
  overlay.id = 'sk-overlay'
  document.body.appendChild(overlay)
  return render(<ImageGenDrawer open onClose={vi.fn()} projectId={projectId} projectName="振三街北" />)
}

beforeEach(() => {
  vi.clearAllMocks()
  document.getElementById('sk-overlay')?.remove()
  h.cs.listAssets.mockResolvedValue({ items: [], total: 0 })
})

describe('ImageGenDrawer · 用途闸(2A)', () => {
  it('未选用途 → 确认生成禁用 + 警示文案;选后警示消失', async () => {
    mountOpen()
    await waitFor(() => expect(h.cs.listAssets).toHaveBeenCalled())
    expect(screen.getByText(/先选用途才能继续/)).toBeInTheDocument()
    const genBtn = screen.getByRole('button', { name: /确认生成/ })
    expect(genBtn).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '概念图' }))
    expect(screen.queryByText(/先选用途才能继续/)).not.toBeInTheDocument()
  })

  it('无项目 → 空态指引,不显示表单', () => {
    mountOpen(null)
    expect(screen.getByText(/暂无作用项目/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '概念图' })).not.toBeInTheDocument()
  })
})

describe('ImageGenDrawer · 提示词扩写', () => {
  it('AI 扩写走 runCommand(/出图),confirm_image 回填草案', async () => {
    h.cs.runCommand.mockResolvedValue({ status: 'confirm_image', prompt: 'aerial view, slab towers, dusk', message: '', model: '' })
    mountOpen()
    await userEvent.click(screen.getByRole('button', { name: '概念图' }))
    await userEvent.type(screen.getByPlaceholderText(/用中文描述画面意图/), '沿街板楼')
    await userEvent.click(screen.getByRole('button', { name: /AI 扩写草案/ }))
    await waitFor(() => expect(h.cs.runCommand).toHaveBeenCalledWith(3, expect.stringContaining('/出图')))
    expect(screen.getByDisplayValue('aerial view, slab towers, dusk')).toBeInTheDocument()
  })

  it('扩写 not_configured → 人话提示,可手写不阻断', async () => {
    h.cs.runCommand.mockResolvedValue({ status: 'not_configured', prompt: '', message: 'AI 未配置', model: '' })
    mountOpen()
    await userEvent.click(screen.getByRole('button', { name: '概念图' }))
    await userEvent.click(screen.getByRole('button', { name: /AI 扩写草案/ }))
    await waitFor(() => expect(screen.getByText(/AI 未配置/)).toBeInTheDocument())
    // 手写英文提示词后仍可生成
    await userEvent.type(screen.getByPlaceholderText(/英文提示词草案/), 'hand written prompt')
    expect(screen.getByRole('button', { name: /确认生成/ })).toBeEnabled()
  })
})

describe('ImageGenDrawer · 并行生成(3B)与失败诚实', () => {
  it('张数=3 → 并行 3 次 runSkill(img),携带用途与提示词;成功槽显图+派发 assets-updated', async () => {
    h.cs.runSkill.mockResolvedValue({ status: 'ok', image_url: '3/AI-1.jpg', image_model: 'gemini', error_message: '', content: '' })
    const evt = vi.fn()
    window.addEventListener('romai:assets-updated', evt)
    mountOpen()
    await userEvent.click(screen.getByRole('button', { name: '氛围图' }))
    await userEvent.type(screen.getByPlaceholderText(/英文提示词草案/), 'dusk street view')
    await userEvent.click(screen.getByRole('button', { name: '3' }))
    await userEvent.click(screen.getByRole('button', { name: /确认生成\(3\)/ }))
    await waitFor(() => expect(h.cs.runSkill).toHaveBeenCalledTimes(3))
    const call = h.cs.runSkill.mock.calls[0]
    expect(call[1]).toBe('img')            // skillId
    expect(call[5]).toBe('dusk street view') // imagePrompt
    expect(call[9]).toContain('氛围图')     // imagePurpose
    await waitFor(() => expect(screen.getAllByAltText('AI 生成意向图')).toHaveLength(3))
    expect(evt).toHaveBeenCalled()
    window.removeEventListener('romai:assets-updated', evt)
  })

  it('单槽失败 → 该槽如实显示错误+重试;成功槽不受影响', async () => {
    h.cs.runSkill
      .mockResolvedValueOnce({ status: 'ok', image_url: '3/AI-a.jpg', image_model: 'gemini', error_message: '', content: '' })
      .mockResolvedValueOnce({ status: 'error', image_url: '', image_model: '', error_message: 'upstream 401', content: '' })
    mountOpen()
    await userEvent.click(screen.getByRole('button', { name: '场景图' }))
    await userEvent.type(screen.getByPlaceholderText(/英文提示词草案/), 'p')
    await userEvent.click(screen.getByRole('button', { name: '2' }))
    await userEvent.click(screen.getByRole('button', { name: /确认生成\(2\)/ }))
    await waitFor(() => expect(screen.getByText(/upstream 401/)).toBeInTheDocument())
    expect(screen.getAllByAltText('AI 生成意向图')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /重试 ↻/ })).toBeInTheDocument()
  })
})

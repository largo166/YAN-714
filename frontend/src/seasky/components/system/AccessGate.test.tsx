import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  status: vi.fn(),
  login: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    accessStatus: h.status,
    accessLogin: h.login,
  },
}))

import { AccessGate } from './AccessGate'

beforeEach(() => vi.clearAllMocks())

describe('AccessGate · 公网访问口令', () => {
  it('未认证时不挂载内部应用，正确口令后才进入', async () => {
    h.status.mockResolvedValue({ enabled: true, configured: true, authenticated: false })
    h.login.mockRejectedValueOnce(new Error('API 401: 访问口令不正确')).mockResolvedValueOnce({ ok: true })

    render(
      <AccessGate>
        <div>内部项目资料</div>
      </AccessGate>,
    )

    expect(await screen.findByRole('heading', { name: 'ROM-AI 受保护访问' })).toBeInTheDocument()
    expect(screen.queryByText('内部项目资料')).not.toBeInTheDocument()

    const input = screen.getByLabelText('访问口令')
    await userEvent.type(input, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '进入 ROM-AI' }))
    expect(await screen.findByText(/访问口令不正确/)).toBeInTheDocument()
    expect(screen.queryByText('内部项目资料')).not.toBeInTheDocument()

    await userEvent.clear(input)
    await userEvent.type(input, 'correct')
    await userEvent.click(screen.getByRole('button', { name: '进入 ROM-AI' }))
    await waitFor(() => expect(screen.getByText('内部项目资料')).toBeInTheDocument())
  })

  it('本地关闭访问闸时直接进入，不制造额外口令', async () => {
    h.status.mockResolvedValue({ enabled: false, configured: false, authenticated: true })
    render(
      <AccessGate>
        <div>本地应用</div>
      </AccessGate>,
    )
    expect(await screen.findByText('本地应用')).toBeInTheDocument()
    expect(h.login).not.toHaveBeenCalled()
  })
})

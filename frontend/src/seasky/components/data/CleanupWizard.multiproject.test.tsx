import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* ═══ 块1 A语义·确认屏交互回归守卫(2026-07-07) ═══
   本块新造的唯一交互面:选父目录→多项目确认屏(勾选/黄标/单项目切换/散落提示)。
   验证策略(按 CLAUDE.md 成本红线):交互逻辑 → 组件测试(注入 staged multi 结果直接渲染 step2,
   不用 CDP 点 FolderPicker)。留仓库=永久守卫。最终视觉在真 exe 终验。 */

const { multiStaging, ingestStart } = vi.hoisted(() => ({
  ingestStart: vi.fn().mockResolvedValue({ job_id: 'test-job' }),
  multiStaging: {
    groups: [
      { source_dir: 'C:/父/项目甲', project_hint: '项目甲', project_id: 0, warn_reason: '', files: [
        { abs_path: 'C:/父/项目甲/a.txt', name: 'a.txt', ext: '.txt', size: 10, supported: true, already_indexed: false },
        { abs_path: 'C:/父/项目甲/a2.md', name: 'a2.md', ext: '.md', size: 8, supported: true, already_indexed: false },
      ] },
      { source_dir: 'C:/父/项目乙', project_hint: '项目乙', project_id: 0, warn_reason: '', files: [
        { abs_path: 'C:/父/项目乙/b.txt', name: 'b.txt', ext: '.txt', size: 5, supported: true, already_indexed: false },
      ] },
      { source_dir: 'C:/父/01_资料', project_hint: '01_资料', project_id: 0, warn_reason: '这个名字像「项目内部的编号目录」,确认要作为一个独立项目吗?', files: [
        { abs_path: 'C:/父/01_资料/c.txt', name: 'c.txt', ext: '.txt', size: 3, supported: true, already_indexed: false },
      ] },
    ],
    total_files: 4,
    supported_files: 4,
    already_indexed: 0,
    type_stats: { '.txt': 3, '.md': 1 },
    skipped_unsupported: 0,
    selection_mode: 'multi',
    loose_files: 2,          // 父目录直属散落文件 2
    error: '',
  },
}))

vi.mock('@/lib/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({ repository_root_path: 'C:/仓库-00' }),
    updateSettings: vi.fn().mockResolvedValue({}),
    listDir: vi.fn().mockResolvedValue({ accessible: true }),
    staging: vi.fn().mockResolvedValue(multiStaging),
    ingestStart,
  },
}))
vi.mock('../../services', () => ({ knowledgeService: { stats: vi.fn().mockResolvedValue({ documents: 42 }) } }))
vi.mock('@/components/FolderPicker', () => ({
  default: ({ open, onPick }: { open: boolean; onPick: (p: string) => void }) =>
    open ? <button data-testid="mock-pick" onClick={() => onPick('C:/父')}>选父目录</button> : null,
}))
class FakeES { onmessage: ((e: MessageEvent) => void) | null = null; onerror: (() => void) | null = null; close() {} }
;(globalThis as unknown as { EventSource: unknown }).EventSource = FakeES as unknown

import { CleanupWizard } from './CleanupWizard'

async function toStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('下一步:选取资料 →'))
  await user.click(await screen.findByTestId('mock-pick'))
  await screen.findByText('下一步:执行 →')
}

describe('CleanupWizard · 块1 A语义确认屏', () => {
  beforeEach(() => { ingestStart.mockClear() })

  it('multi:列出各子项目 + 检测提示 + 散落提示行', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)
    // 三个子项目都在
    expect(screen.getByText('项目甲')).toBeInTheDocument()
    expect(screen.getByText('项目乙')).toBeInTheDocument()
    expect(screen.getByText('01_资料')).toBeInTheDocument()
    // 检测到 3 个项目提示
    expect(screen.getByText(/检测到/)).toBeInTheDocument()
    // 散落提示行显 2
    expect(screen.getByText(/该目录下有 2 个散落文件未归入任何项目/)).toBeInTheDocument()
    // 编号目录黄标在位
    expect(screen.getByText('⚠ 疑似内部目录')).toBeInTheDocument()
  })

  it('交互①:取消勾一个子目录 → 执行数相应减', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)
    // 全勾时可入库 = 4
    expect(screen.getByText((_, el) => el?.textContent === '可入库 4 个 · 已在库 0 个')).toBeTruthy()
    // 取消勾项目甲(2 文件)→ 应剩 2
    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0]) // 第一个=项目甲
    await waitFor(() => expect(screen.getByText((_, el) => el?.textContent === '可入库 2 个 · 已在库 0 个')).toBeTruthy())
  })

  it('交互②:全部取消 → 下一步:执行 禁用', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)
    const nextBtn = screen.getByText('下一步:执行 →').closest('button')!
    expect(nextBtn).not.toBeDisabled()
    for (const cb of screen.getAllByRole('checkbox')) await user.click(cb)
    await waitFor(() => expect(nextBtn).toBeDisabled())
  })

  it('交互③:切「其实是同一个项目」→ 执行传原始父目录一条路径', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)
    await user.click(screen.getByText('其实是同一个项目 →'))
    expect(screen.getByText(/整个目录作为/)).toBeInTheDocument()
    // 执行 → ingestStart 收到单一路径 = 父目录
    await user.click(screen.getByText('下一步:执行 →'))
    await user.click(await screen.findByText('开始入库'))
    await waitFor(() => expect(ingestStart).toHaveBeenCalledWith(['C:/父']))
  })

  it('交互(默认):全勾执行 → ingestStart 收到三个子目录路径', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)
    await user.click(screen.getByText('下一步:执行 →'))
    await user.click(await screen.findByText('开始入库'))
    await waitFor(() => expect(ingestStart).toHaveBeenCalledWith(['C:/父/项目甲', 'C:/父/项目乙', 'C:/父/01_资料']))
  })
})

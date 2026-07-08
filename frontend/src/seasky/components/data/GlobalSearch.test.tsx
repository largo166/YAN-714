/** P0 检索第一生产力 · GlobalSearch 行为测试(2026-07-08)。
 * 锁:Ctrl+K开关/Esc关、@解析注入project_id、重名弹选不猜、未匹配降级提示、
 * 类型分组渲染、reveal按钮仅project_file_id>0、reveal失败如实呈现。 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  api: {
    searchKnowledge: vi.fn(),
    revealProjectFile: vi.fn(),
  },
}))
vi.mock('@/lib/api', () => ({ api: h.api }))

import { GlobalSearch, matchProjects, parseAtQuery } from './GlobalSearch'

const PROJECTS = [
  { id: 1, name: '石家庄市庄地块' },
  { id: 2, name: '市庄二期' },
  { id: 3, name: '济南长岭山E15' },
]
const PROJ = {
  projects: PROJECTS,
  cur: null,
  loading: false,
  err: null,
  switchProject: vi.fn(),
  renameProject: vi.fn(),
  reload: vi.fn(),
} as never

function hit(over: Record<string, unknown> = {}) {
  return {
    document_id: 1, title: '总图.pdf', snippet: '…总图…', score: 1, matched_text: '总图',
    engine: 'fts5', locator: '', file_type: 'pdf', doc_type: '图纸', updated_at: '2026-07-08T00:00:00',
    project_id: 1, project_name: '石家庄市庄地块', project_file_id: 11, ...over,
  }
}

function mountOpen() {
  /* GlobalSearch Portal 到 #sk-overlay——测试先造这个根 */
  const overlay = document.createElement('div')
  overlay.id = 'sk-overlay'
  document.body.appendChild(overlay)
  return render(<GlobalSearch open onClose={vi.fn()} proj={PROJ} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  document.getElementById('sk-overlay')?.remove()
})

describe('parseAtQuery/matchProjects 纯函数', () => {
  it('@市庄 总图 → {projTerm:市庄, rest:总图};无@原样', () => {
    expect(parseAtQuery('@市庄 总图')).toEqual({ projTerm: '市庄', rest: '总图' })
    expect(parseAtQuery('总图')).toEqual({ projTerm: null, rest: '总图' })
  })
  it('matchProjects 子串命中,重名返回多个(不猜)', () => {
    expect(matchProjects('市庄', PROJECTS).map((p) => p.id)).toEqual([1, 2])
    expect(matchProjects('长岭山', PROJECTS)).toHaveLength(1)
    expect(matchProjects('不存在', PROJECTS)).toHaveLength(0)
  })
})

describe('GlobalSearch 交互', () => {
  it('唯一匹配 → 注入 project_id 走同一通路', async () => {
    h.api.searchKnowledge.mockResolvedValue({ query: '', engine: 'fts5', hits: [hit()] })
    mountOpen()
    await userEvent.type(screen.getByRole('textbox'), '@长岭山 总图')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await waitFor(() => expect(h.api.searchKnowledge).toHaveBeenCalledWith('总图', 24, 3))
  })

  it('重名 → 弹选不猜;点选后按所选项目检索', async () => {
    h.api.searchKnowledge.mockResolvedValue({ query: '', engine: 'fts5', hits: [] })
    mountOpen()
    await userEvent.type(screen.getByRole('textbox'), '@市庄 总图')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(h.api.searchKnowledge).not.toHaveBeenCalled() // 未猜
    expect(screen.getByText(/匹配到 2 个项目/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '市庄二期' }))
    await waitFor(() => expect(h.api.searchKnowledge).toHaveBeenCalledWith('总图', 24, 2))
  })

  it('未匹配项目 → 降级全库并提示,不空白', async () => {
    h.api.searchKnowledge.mockResolvedValue({ query: '', engine: 'fts5', hits: [] })
    mountOpen()
    await userEvent.type(screen.getByRole('textbox'), '@不存在 总图')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await waitFor(() => expect(h.api.searchKnowledge).toHaveBeenCalledWith('总图', 24, undefined))
    expect(screen.getByText(/未识别项目「不存在」,已按全库检索/)).toBeInTheDocument()
  })

  it('命中按类型分组;reveal 按钮仅 project_file_id>0 出现', async () => {
    h.api.searchKnowledge.mockResolvedValue({
      query: '', engine: 'fts5',
      hits: [hit(), hit({ document_id: 2, title: '纪要.md', doc_type: '会议纪要', project_file_id: 0 })],
    })
    mountOpen()
    await userEvent.type(screen.getByRole('textbox'), '总图')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('图纸')).toBeInTheDocument())
    expect(screen.getByText('会议纪要')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '打开所在位置' })).toHaveLength(1) // 只有 file_id>0 那条
  })

  it('reveal 失败(文件缺失404) → 如实显示可读错误,不静默', async () => {
    h.api.searchKnowledge.mockResolvedValue({ query: '', engine: 'fts5', hits: [hit()] })
    h.api.revealProjectFile.mockRejectedValue(new Error('文件不在预期位置。建议到设置页跑一次「库健康体检」。'))
    mountOpen()
    await userEvent.type(screen.getByRole('textbox'), '总图')
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('button', { name: '打开所在位置' })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '打开所在位置' }))
    await waitFor(() => expect(screen.getByText(/库健康体检/)).toBeInTheDocument())
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/* ═══ CleanupWizard P0 行为回归守卫(2026-07-06) ═══
   红线:入库主链路数据可信度——「以为选了/其实是旧的、以为入了/其实没入」按 P0。
   本测试永久守护:步骤条回退到「仓库」清空 staging/pickedPaths/receipt/events;3→2 回退保留 staging。
   验证策略选型见 CLAUDE.md「验证成本红线」:状态/交互逻辑 → 组件级测试(非端到端点击)。 */

/* --- mock 外部依赖:注入受控 staging,隔离真实后端/FolderPicker/文件系统 ---
   受控 staging 用 vi.hoisted 提升,供下方被提升的 vi.mock 工厂安全引用。 */
const { stagingResult } = vi.hoisted(() => ({
  stagingResult: {
    groups: [
      {
        source_dir: 'C:/fake/testdata',
        project_hint: 'testdata',
        project_id: 0,
        files: [
          { abs_path: 'C:/fake/testdata/a.txt', name: 'a.txt', ext: '.txt', size: 10, supported: true, already_indexed: false },
          { abs_path: 'C:/fake/testdata/b.dwg', name: 'b.dwg', ext: '.dwg', size: 3, supported: false, already_indexed: false },
        ],
      },
    ],
    total_files: 2,
    supported_files: 1,
    already_indexed: 0,
    type_stats: { '.txt': 1, '.dwg': 1 },
    skipped_unsupported: 1,
    error: '',
  },
}))

vi.mock('@/lib/api', () => ({
  api: {
    getSettings: vi.fn().mockResolvedValue({ repository_root_path: 'C:/仓库-00' }),
    updateSettings: vi.fn().mockResolvedValue({}),
    listDir: vi.fn().mockResolvedValue({ accessible: true }),
    staging: vi.fn().mockResolvedValue(stagingResult),
    ingestStart: vi.fn().mockResolvedValue({ job_id: 'test-job' }),
  },
}))

vi.mock('../../services', () => ({
  knowledgeService: { stats: vi.fn().mockResolvedValue({ documents: 42 }) },
}))

/* mock FolderPicker:真组件是逐层 list-dir 弹窗(端到端点击成本极高,故隔离)。
   这里只暴露一个「模拟选定」按钮,点击即以受控路径回调 onPick,复现选取动作。 */
vi.mock('@/components/FolderPicker', () => ({
  default: ({ open, onPick }: { open: boolean; onPick: (p: string) => void }) =>
    open ? (
      <button data-testid="mock-pick" onClick={() => onPick('C:/fake/testdata')}>
        mock 选定 testdata
      </button>
    ) : null,
}))

/* EventSource 在 jsdom 不存在;第3步执行会 new EventSource——给个惰性桩,避免 ReferenceError。
   本测试不验 SSE(那属接口契约,另用 API 断言),只验步骤状态机,故桩不产事件即可。 */
class FakeES {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close() {}
}
;(globalThis as unknown as { EventSource: unknown }).EventSource = FakeES as unknown

import { CleanupWizard } from './CleanupWizard'

/** 驱动到第2步(staging 已出):打开→(仓库已配)点选取资料→mock 选定→等收料单渲染。 */
async function toStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('下一步:选取资料 →'))
  await user.click(await screen.findByTestId('mock-pick'))
  // step2 收料单标志:统计条 + 底部「下一步:执行 →」
  await screen.findByText('下一步:执行 →')
}

describe('CleanupWizard · P0 步骤回退数据可信度', () => {
  beforeEach(() => vi.clearAllMocks())

  it('回退到「仓库」步 → staging/收料单被清空(杜绝以为选了/其实是旧的)', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)

    // 收料单在场:能看到不支持文件计数与执行按钮
    expect(screen.getByText('下一步:执行 →')).toBeInTheDocument()
    expect(screen.getByText('重新选取')).toBeInTheDocument()

    // 点步骤条「仓库」回退(step1)
    await user.click(screen.getByText('仓库'))

    // 断言:回到 step1(见「更换仓库 →」)且收料单彻底消失(step2 专属 UI 不在)
    await waitFor(() => expect(screen.getByText('更换仓库 →')).toBeInTheDocument())
    expect(screen.queryByText('下一步:执行 →')).not.toBeInTheDocument()
    expect(screen.queryByText('重新选取')).not.toBeInTheDocument()

    // 再次进入选取:应重新弹 picker(全新一次),而非直接显示上次的收料单
    await user.click(screen.getByText('下一步:选取资料 →'))
    expect(screen.getByTestId('mock-pick')).toBeInTheDocument()
    expect(screen.queryByText('下一步:执行 →')).not.toBeInTheDocument()
  })

  it('3→2 回退 → staging 保留(同一批选取,只是复核收料单)', async () => {
    const user = userEvent.setup()
    render(<CleanupWizard open onClose={() => {}} />)
    await toStep2(user)

    // 进第3步(执行)
    await user.click(screen.getByText('下一步:执行 →'))
    await screen.findByText('开始入库')

    // 从第3步点步骤条「选取」回退到 step2
    await user.click(screen.getByText('选取'))

    // 断言:收料单仍在(未被清),证明 3→2 保留语义
    await waitFor(() => expect(screen.getByText('下一步:执行 →')).toBeInTheDocument())
    expect(screen.getByText('重新选取')).toBeInTheDocument()
  })
})

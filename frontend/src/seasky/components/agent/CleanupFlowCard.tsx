import { FlowBtn, FlowCard, FlowTonePill } from './flowKit'

/* b2 · 一键清理动作卡(跳板版,ADR-001 裁决:破坏动作只在 b1 权威面执行)。
   营地收回独立执行权——不在对话气泡里跑 scan/preview/apply,只做"去数据基地清理"的深链跳板。
   b1 的 CleanupOverlay(全屏浮层+两步双闸+撤销)是唯一权威操作面。 */

export function CleanupFlowCard({ onGoCleanup }: { onGoCleanup: () => void }) {
  return (
    <FlowCard icon="🧹" title="一键清理 · 工作目录" pill={<FlowTonePill tone="neutral" text="在数据基地执行" />}>
      <div className="flex flex-col gap-2.5">
        <div className="text-sk-muted">
          清理会移动/隔离磁盘文件(可撤销),属破坏性动作——统一在数据基地的清理面板执行,那里有扫描预览、两步确认与一键撤销的完整闸门,不在对话流里轻量触发。
        </div>
        <div>
          <FlowBtn kind="primary" onClick={onGoCleanup}>去数据基地清理 →</FlowBtn>
        </div>
      </div>
    </FlowCard>
  )
}

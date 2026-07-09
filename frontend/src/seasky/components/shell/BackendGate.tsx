import { GhostButton } from '../common/PillButton'
import type { BackendGate as GateState } from '../../hooks/useBackendGate'

/* 全局后端连接闸的可视层(海天语言,根治红字反复出现):
   - 未连接:整屏单一提示(盖住一切,杜绝各板满屏红字);给"重试 + 从 8000 打开"指引。
   - 版本不一致:非阻断顶部横幅(已批:只提示不拦),不挡使用。 */

export function BackendDisconnected({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-[rgba(5,7,8,.94)] px-8 text-center backdrop-blur-[8px]">
      <div className="sk-horizon" style={{ bottom: '38%' }} />
      <div className="font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] text-sk-muted2">Backend Unreachable　后端未连接</div>
      <div className="max-w-[540px] font-skcjk text-[19px] font-light leading-[1.7] tracking-[0.04em] text-sk-fg">
        本应用需要连接本地后端服务。
        <br />
        请从 <span className="sk-accent-text font-normal">http://127.0.0.1:8000/seasky.html</span> 打开。
      </div>
      <div className="max-w-[520px] font-skcjk text-[12.5px] font-light leading-[1.7] text-sk-muted2">
        若你正开着开发端口(5173 / 4173),它们连不到后端——请改用 8000，或运行一键启动脚本 <span className="font-skmono text-[11.5px] text-sk-muted">scripts/start-romai.ps1</span>。
      </div>
      {message && (
        <div className="max-w-[520px] font-skcjk text-[11px] font-light leading-[1.6] text-sk-muted2 opacity-70">{message}</div>
      )}
      <GhostButton pri onClick={onRetry} className="mt-1 px-6 py-2.5">
        重试连接 ↻
      </GhostButton>
    </div>
  )
}

export function VersionMismatchBanner({ gate, onRefresh }: { gate: GateState; onRefresh: () => void }) {
  return (
    <div className="absolute left-1/2 top-[76px] z-[150] flex -translate-x-1/2 items-center gap-3 rounded-full border-[0.5px] border-[rgba(201,178,127,.4)] bg-[rgba(28,24,14,.92)] px-4 py-2 backdrop-blur-[10px]">
      <span className="h-[6px] w-[6px] flex-none rounded-full bg-sk-warn shadow-[0_0_10px_rgba(201,178,127,.5)]" />
      <span className="font-skcjk text-[11.5px] font-light tracking-[0.04em] text-sk-warn">
        前端版本与后端不一致（前端 {gate.frontHash?.slice(0, 6) ?? '—'} · 后端 {gate.backHash?.slice(0, 6) ?? '—'}）—— 建议重新 build 或强制刷新
      </span>
      <button
        className="cursor-pointer rounded-full border-[0.5px] border-[rgba(201,178,127,.4)] px-3 py-[3px] font-skcjk text-[10.5px] font-light text-sk-warn transition-colors hover:bg-[rgba(201,178,127,.12)]"
        onClick={onRefresh}
      >
        刷新
      </button>
    </div>
  )
}

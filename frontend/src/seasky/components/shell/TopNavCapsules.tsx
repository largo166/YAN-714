import { BOARD_NAMES, type BoardIndex } from '../../lib/constants'
import { cn } from '../../lib/cn'

/** 顶部五板块胶囊(P0-1 常驻;Garch 式胶囊组)+ 右缘设置入口(退役前置:配置能力海天化) */
export function TopNavCapsules({
  board,
  onSwitch,
  onOpenSettings,
}: {
  board: BoardIndex
  onSwitch: (i: BoardIndex) => void
  onOpenSettings?: () => void
}) {
  return (
    <nav className="absolute left-0 top-0 z-skchrome flex h-[46px] w-full items-center gap-[26px] bg-black px-6">
      <span className="font-sans text-[14px] font-medium tracking-[0.06em] text-sk-fg">
        ROM-<span className="text-sk-primary">AI</span>
      </span>
      <div className="mx-auto flex gap-[3px] rounded-full border-[0.5px] border-sk-hairsoft bg-[rgba(242,241,238,.045)] p-[3px]">
        {BOARD_NAMES.map((name, i) => (
          <button
            key={name}
            className={cn(
              'h-7 cursor-pointer rounded-full border-0 bg-transparent px-[15px] font-skcjk text-[12px] font-normal tracking-[0.12em] [text-indent:0.12em] transition-colors duration-200',
              i === board ? 'bg-[rgba(242,241,238,.1)] text-sk-fg' : 'text-sk-muted2 hover:text-sk-muted',
            )}
            onClick={() => onSwitch(i as BoardIndex)}
          >
            {name}
          </button>
        ))}
      </div>
      <span className="flex items-center gap-3.5">
        <span className="flex items-center gap-2">
          <span className="h-[5px] w-[5px] rounded-full bg-sk-primary shadow-[0_0_8px_var(--sk-primary)]" />
          <span className="font-sans text-[10.5px] font-medium uppercase tracking-[0.2em] text-sk-muted2">
            Memory Layer
          </span>
        </span>
        {onOpenSettings && (
          <button
            className="cursor-pointer border-0 bg-transparent font-skcjk text-[12px] font-light tracking-[0.14em] text-sk-muted2 transition-colors duration-200 hover:text-sk-primary"
            title="设置(AI Key / 仓库 / 工作目录 / 收件箱)"
            onClick={onOpenSettings}
          >
            设置
          </button>
        )}
      </span>
    </nav>
  )
}

/** 底部状态栏 */
export function StatusBar({ left, pulse = false }: { left: string; pulse?: boolean }) {
  const label = 'font-sans text-[10.5px] font-medium uppercase tracking-[0.3em] [text-indent:0.3em] text-sk-muted2'
  return (
    <div className="absolute bottom-0 left-0 z-skchrome flex h-[30px] w-full items-center justify-between bg-black px-6">
      <span className={cn(label, pulse && 'sk-pulse')}>{left}</span>
      <span className={label}>FTS5 Ready · 本地运行 · Cockpit Unlocked</span>
    </div>
  )
}

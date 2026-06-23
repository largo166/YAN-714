import { BOARDS, type BoardKey } from '@/types/boards'

interface Props {
  board: BoardKey
  onBoard: (b: BoardKey) => void
  online: boolean
  onOpenSettings: () => void
  /** 管理员登录后显示 boss 板块；当前阶段管理员后端未接，默认 false */
  adminVisible?: boolean
}

export default function TopBar({ board, onBoard, online, onOpenSettings, adminVisible = false }: Props) {
  return (
    <div className="topbar">
      <div className="wrap">
        <div className="brand" id="brandbtn" title="设置" onClick={onOpenSettings}>
          <svg
            width="30"
            height="30"
            viewBox="0 0 100 100"
            fill="none"
            stroke="#1b1a17"
            strokeWidth="7.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M26 86 L45 16" />
            <path d="M45 16 C74 22 74 56 45 56" />
            <path d="M45 56 L80 86" />
            <path d="M34 56 L45 56" />
            <circle className="node" cx="45" cy="56" r="4.6" fill="#c2703a" stroke="none" />
          </svg>
          <span className="word">
            ROM<span>-AI</span>
          </span>
        </div>
        <nav className="nav">
          {BOARDS.map((b) => {
            if (b.adminOnly && !adminVisible) return null
            return (
              <button
                key={b.key}
                className={board === b.key ? 'on' : ''}
                onClick={() => onBoard(b.key)}
              >
                {b.label}
                {b.adminOnly && <span className="lock">🔒</span>}
              </button>
            )
          })}
        </nav>
        <div className="right">
          <span className="dot" style={online ? undefined : { background: 'var(--mut)' }}></span>
          {online ? '本地运行' : '连接中…'}
        </div>
      </div>
    </div>
  )
}

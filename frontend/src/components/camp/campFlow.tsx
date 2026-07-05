import type { CSSProperties, ReactNode } from 'react'

/* 营地对话流 · 共享类型与卡片外壳(W0)
   三态语言向 seasky 对话态看齐(圆角/发丝边/呼吸点节奏),色票沿用营地现有 C——
   全站换装拍板后只换色值即可平移(用户口径②)。 */

export const C = {
  purple: '#7c5cff', blue: '#42a5ff', gold: '#d7a86e', cyan: '#36e6d4', red: '#ff5e66', amber: '#fdab3d',
  ink: '#f4f1ea', ink2: '#d8d4cc', mut: '#8f96a5', mut2: '#5f6674',
  line: 'rgba(255,255,255,.08)', glass: 'linear-gradient(145deg,rgba(255,255,255,.06),rgba(255,255,255,.028))',
}

/** 动作卡三态(not_configured 是独立中性态,不算失败不伪装成功) */
export type CardTone = 'pending' | 'ok' | 'error' | 'neutral'

export const TONE_COLOR: Record<CardTone, string> = {
  pending: C.amber,
  ok: C.cyan,
  error: C.red,
  neutral: C.mut,
}

let seq = 1
export function nextMsgId() {
  return seq++
}

/** 状态 pill(呼吸点+文案;pending 琥珀呼吸,ok 青,error 红,neutral 灰) */
export function TonePill({ tone, text }: { tone: CardTone; text: string }) {
  const color = TONE_COLOR[tone]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${color}55`, color, borderRadius: 999, padding: '2px 10px', fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
      <span
        className={tone === 'pending' ? 'animate-pulse' : undefined}
        style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {text}
    </span>
  )
}

/** 动作卡外壳:玻璃卡+发丝边+头行(icon/标题/右侧 pill),节奏对齐 seasky 玻璃卡语言 */
export function ActionCardShell({
  icon,
  title,
  pill,
  children,
}: {
  icon: ReactNode
  title: string
  pill: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ border: '1px solid ' + C.line, borderRadius: 16, background: C.glass, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: '8%', width: '84%', height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 28, height: 28, borderRadius: 9, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff', flex: 1, minWidth: 0 }}>{title}</span>
        {pill}
      </div>
      <div style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.65 }}>{children}</div>
    </div>
  )
}

/** 卡内小按钮(主/次/危险三种) */
export function CardBtn({
  kind = 'ghost',
  disabled,
  onClick,
  children,
}: {
  kind?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { border: '1px solid rgba(124,92,255,.55)', background: 'linear-gradient(145deg,rgba(124,92,255,.22),rgba(124,92,255,.06))', color: '#fff' },
    ghost: { border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', color: C.ink2 },
    danger: { border: '1px solid rgba(255,94,102,.45)', background: 'rgba(255,94,102,.08)', color: '#ff9b9b' },
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, height: 30, padding: '0 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, transition: 'all .15s', ...styles[kind] }}
    >
      {children}
    </button>
  )
}

/** 结果计数行(诚实计数:接入N·索引N·失败N·跳过N) */
export function CountRow({ items }: { items: [string, number, string?][] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {items.map(([label, n, color]) => (
        <span key={label} style={{ fontSize: 12 }}>
          <b style={{ fontSize: 16, color: color || C.ink, fontWeight: 700 }}>{n}</b>
          <span style={{ color: C.mut, marginLeft: 4 }}>{label}</span>
        </span>
      ))}
    </div>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'

/** 把 AI 返回的 markdown-ish 文本渲染为干净排版,清除 ###/**\/---/> 等原始符号噪音。
 *  轻量实现(无第三方依赖):标题/加粗/行内代码/有序无序列表/引用/分割线/段落。
 *  设计为可跨界面复用(共创营地成果卡、聊天气泡、研判、认知、元数据)。 */

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'hr' }
  | { t: 'p'; text: string }

function parseBlocks(src: string): Block[] {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let ul: string[] = []
  let ol: string[] = []
  const flushPara = () => {
    if (para.length) {
      blocks.push({ t: 'p', text: para.join(' ') })
      para = []
    }
  }
  const flushLists = () => {
    if (ul.length) {
      blocks.push({ t: 'ul', items: ul })
      ul = []
    }
    if (ol.length) {
      blocks.push({ t: 'ol', items: ol })
      ol = []
    }
  }
  for (const raw of lines) {
    const t = raw.trim()
    if (!t) {
      flushPara()
      flushLists()
      continue
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara()
      flushLists()
      blocks.push({ t: 'hr' })
      continue
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) {
      flushPara()
      flushLists()
      blocks.push({ t: 'h', level: h[1].length, text: h[2] })
      continue
    }
    const q = /^>\s?(.*)$/.exec(t)
    if (q) {
      flushPara()
      flushLists()
      blocks.push({ t: 'quote', text: q[1] })
      continue
    }
    const li = /^[-*+]\s+(.*)$/.exec(t)
    if (li) {
      flushPara()
      if (ol.length) flushLists()
      ul.push(li[1])
      continue
    }
    const oli = /^\d+[.)]\s+(.*)$/.exec(t)
    if (oli) {
      flushPara()
      if (ul.length) flushLists()
      ol.push(oli[1])
      continue
    }
    flushLists()
    para.push(t)
  }
  flushPara()
  flushLists()
  return blocks
}

/** 行内:**加粗** 与 `代码`;其余原样。去掉裸 ** 噪音。 */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>)
    else if (m[2] !== undefined)
      out.push(
        <code key={i++} style={{ background: 'var(--panel2)', borderRadius: 4, padding: '1px 4px', fontSize: '0.92em' }}>
          {m[2]}
        </code>,
      )
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** 取“核心一句”:首个标题文字,否则首个非空行;裁剪到 maxLen。供卡片“核心判断优先”。 */
export function coreLine(src: string, maxLen = 180): string {
  for (const raw of (src || '').replace(/\r\n/g, '\n').split('\n')) {
    const t = raw.trim()
    if (!t) continue
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    const text = (h ? h[2] : t).replace(/\*\*/g, '').replace(/^>\s?/, '').replace(/^[-*+]\s+/, '').trim()
    if (!text) continue
    return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text
  }
  return ''
}

export default function RichText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const blocks = parseBlocks(text)
  return (
    <div className="richtext" style={{ fontSize: 13, lineHeight: 1.65, ...style }}>
      {blocks.map((b, i) => {
        if (b.t === 'hr') return <hr key={i} style={{ border: 0, borderTop: '1px solid var(--line)', margin: '10px 0' }} />
        if (b.t === 'h') {
          const size = b.level <= 1 ? 16 : b.level === 2 ? 15 : 14
          return (
            <div key={i} style={{ fontWeight: 700, fontSize: size, margin: i ? '10px 0 4px' : '0 0 4px', color: 'var(--ink)' }}>
              {renderInline(b.text)}
            </div>
          )
        }
        if (b.t === 'quote')
          return (
            <div
              key={i}
              style={{ borderLeft: '3px solid var(--terra-line)', paddingLeft: 10, margin: '6px 0', color: 'var(--ink2)' }}
            >
              {renderInline(b.text)}
            </div>
          )
        if (b.t === 'ul')
          return (
            <ul key={i} style={{ margin: '4px 0', paddingLeft: 18 }}>
              {b.items.map((it, j) => (
                <li key={j} style={{ margin: '2px 0' }}>
                  {renderInline(it)}
                </li>
              ))}
            </ul>
          )
        if (b.t === 'ol')
          return (
            <ol key={i} style={{ margin: '4px 0', paddingLeft: 18 }}>
              {b.items.map((it, j) => (
                <li key={j} style={{ margin: '2px 0' }}>
                  {renderInline(it)}
                </li>
              ))}
            </ol>
          )
        return (
          <p key={i} style={{ margin: '6px 0' }}>
            {renderInline(b.text)}
          </p>
        )
      })}
    </div>
  )
}

/** 折叠块:默认只显示 summary(核心),点“展开详情”看完整内容。长内容默认收起。 */
export function Foldable({
  summary,
  children,
  openLabel = '展开详情',
  closeLabel = '收起',
  defaultOpen = false,
}: {
  summary?: ReactNode
  children: ReactNode
  openLabel?: string
  closeLabel?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      {!open && summary != null && <div>{summary}</div>}
      {open && children}
      <button className="anbtn" type="button" onClick={() => setOpen((v) => !v)} style={{ marginTop: 6, fontSize: 12 }}>
        {open ? `${closeLabel} ▴` : `${openLabel} ▾`}
      </button>
    </div>
  )
}

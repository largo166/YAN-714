import { useRef, useState, type KeyboardEvent } from 'react'

import { ModelSelector } from './ModelSelector'

/* ═══ 大 composer(基准板核心件,构图冻结):圆角容器 / + 附件 / 模型切换 / Enter 发送 ═══
   b2 接真波:+ 号从「仅展示文件名」升级为真接入入口(onAttach 交给动作卡);
   onDraft 让快捷卡能取到草稿文本作为技能输入(紫黑 composer 同语义)。 */

interface AgentComposerProps {
  placeholder: string
  model: string
  onModelSelect: (m: string) => void
  onSend: (text: string) => void
  onDraft?: (text: string) => void
  onAttach?: (files: File[]) => void
  onSlash?: () => void
  pendingLabel?: string | null
  onClearPending?: () => void
}

export function AgentComposer({ placeholder, model, onModelSelect, onSend, onDraft, onAttach, onSlash, pendingLabel, onClearPending }: AgentComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [hasText, setHasText] = useState(false)

  const send = () => {
    const ta = taRef.current
    if (!ta) return
    const txt = ta.value.trim()
    /* 有预填技能时空文本也可确认执行;否则需有文本 */
    if (!txt && !pendingLabel) return
    ta.value = ''
    setHasText(false)
    onDraft?.('')
    onSend(txt)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="w-full" data-in>
      <div className="relative rounded-skcomposer border-[0.5px] border-sk-border bg-sk-composer p-[18px] pb-3 backdrop-blur-[14px] transition-all duration-[250ms] focus-within:border-[rgba(127,179,207,.45)] focus-within:shadow-[0_0_34px_rgba(127,179,207,.12)]">
        {pendingLabel && (
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-[rgba(127,179,207,.4)] bg-[rgba(127,179,207,.1)] px-2.5 py-1 font-skcjk text-[11.5px] font-normal text-sk-primary">
              已选:{pendingLabel}
              <button className="cursor-pointer text-sk-muted2 hover:text-sk-fg" title="取消" onClick={onClearPending}>✕</button>
            </span>
            <span className="font-skcjk text-[10.5px] font-light text-sk-muted2">补充要求(可留空),回车确认执行</span>
          </div>
        )}
        <textarea
          ref={taRef}
          className="h-[92px] w-full resize-none border-0 bg-transparent font-skcjk text-[14.5px] font-light leading-[1.8] tracking-[0.05em] text-sk-fg outline-none placeholder:text-sk-muted2"
          placeholder={pendingLabel ? `为「${pendingLabel}」补充要求…　Enter 确认执行` : placeholder}
          onKeyDown={onKey}
          onChange={(e) => {
            const v = e.target.value
            setHasText(!!v.trim())
            onDraft?.(v)
            /* 空框首字符输入 "/" → 唤出命令面板(经典 slash 行为),并清掉那个 "/" */
            if (v === '/' && onSlash) {
              e.target.value = ''
              setHasText(false)
              onDraft?.('')
              onSlash()
            }
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[9px] border-[0.5px] border-sk-hairsoft bg-transparent text-[15px] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
            title="接入文件到当前项目(txt/md/pdf/docx/pptx/xlsx/图片)"
            onClick={() => fileRef.current?.click()}
          >
            +
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              onAttach?.(Array.from(e.target.files || []))
              e.target.value = ''
            }}
          />
          <ModelSelector model={model} onSelect={onModelSelect} />
          <button
            className={`grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-full border-0 text-[15px] transition-colors duration-200 ${
              hasText || pendingLabel ? 'bg-sk-primary text-[#0a0c0e] hover:bg-[#8fc0da]' : 'bg-[rgba(242,241,238,.08)] text-sk-muted'
            }`}
            title="发送 · Enter"
            onClick={send}
          >
            ↑
          </button>
        </div>
      </div>
      <div className="mt-1.5 px-1 font-sans text-[10px] font-light tracking-[0.08em] text-[rgba(161,165,170,.45)]">
        Enter 发送 · Shift+Enter 换行
      </div>
    </div>
  )
}

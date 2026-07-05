import { useRef, useState, type KeyboardEvent } from 'react'

import { ModelSelector } from './ModelSelector'

/* ═══ 大 composer(基准板核心件):圆角容器 / + 附件 / 模型切换 / Enter 发送 · Shift+Enter 换行 ═══ */

interface AgentComposerProps {
  placeholder: string
  model: string
  onModelSelect: (m: string) => void
  onSend: (text: string) => void
}

export function AgentComposer({ placeholder, model, onModelSelect, onSend }: AgentComposerProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<string[]>([])

  const send = () => {
    const ta = taRef.current
    if (!ta) return
    const txt = ta.value.trim()
    if (!txt) return
    ta.value = ''
    onSend(txt)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }
  const pickFiles = () => fileRef.current?.click()
  const onFiles = () => {
    const list = Array.from(fileRef.current?.files ?? []).map((f) => f.name)
    setFiles(list)
  }

  return (
    <div className="mt-[22px] w-[min(760px,86%)]" data-in>
      <div className="relative rounded-skcomposer border-[0.5px] border-sk-border bg-sk-composer p-[18px] pb-3 backdrop-blur-[14px] transition-all duration-[250ms] focus-within:border-[rgba(127,179,207,.45)] focus-within:shadow-[0_0_34px_rgba(127,179,207,.12)]">
        <textarea
          ref={taRef}
          className="h-16 w-full resize-none border-0 bg-transparent font-skcjk text-[14.5px] font-light leading-[1.8] tracking-[0.05em] text-sk-fg outline-none placeholder:text-sk-muted2"
          placeholder={placeholder}
          onKeyDown={onKey}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            className="grid h-[30px] w-[30px] cursor-pointer place-items-center rounded-[9px] border-[0.5px] border-sk-hairsoft bg-transparent text-[15px] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
            title="添加附件(本地选择,原型仅展示文件名)"
            onClick={pickFiles}
          >
            +
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
          <span className="flex min-w-0 gap-1.5 overflow-hidden">
            {files.slice(0, 3).map((f) => (
              <span
                key={f}
                className="cursor-default rounded-full border-[0.5px] border-sk-hairsoft px-3 py-1 font-skcjk text-[10.5px] font-light tracking-[0.1em] text-sk-muted2"
                title={`${f}(原型仅展示文件名,不上传)`}
              >
                {f.length > 18 ? `${f.slice(0, 16)}…` : f}
              </span>
            ))}
            {files.length > 3 && (
              <span className="cursor-default rounded-full border-[0.5px] border-sk-hairsoft px-3 py-1 font-skcjk text-[10.5px] font-light text-sk-muted2">
                +{files.length - 3}
              </span>
            )}
          </span>
          <ModelSelector model={model} onSelect={onModelSelect} />
          <button
            className="grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-full border-0 bg-sk-primary text-[15px] text-[#0a0c0e] transition-colors duration-200 hover:bg-[#8fc0da]"
            title="发送 · Enter"
            onClick={send}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

import { MODELS } from '../../lib/constants'
import { DropMenu } from '../common/Modal'

/** 模型选择 pill(母版 cfg-pill:ROM Max ▾ 上弹下拉) */
export function ModelSelector({ model, onSelect }: { model: string; onSelect: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const shortName = model.split(' · ')[0]

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  return (
    <span
      className="relative ml-auto inline-flex cursor-pointer items-center gap-[7px] rounded-full border-[0.5px] border-sk-hairsoft px-[13px] py-1.5 font-skcjk text-[11.5px] font-normal tracking-[0.08em] text-sk-muted transition-all duration-200 hover:border-sk-hair hover:text-sk-fg"
      onClick={(e) => {
        e.stopPropagation()
        setOpen((o) => !o)
      }}
    >
      ◍ {shortName}
      <span className="text-[10px] text-sk-muted2">▾</span>
      <DropMenu
        open={open}
        placement="top-right"
        gap={10}
        items={MODELS.map((m) => ({
          label: m,
          cur: m === model,
          onSelect: () => {
            onSelect(m)
            setOpen(false)
          },
        }))}
      />
    </span>
  )
}

import type { Skill } from '@/types/schemas'

import { CardHead } from '../common/GlassCard'
import { GhostButton, Pill } from '../common/PillButton'

/* 技能库全屏浮层(二级态,构图冻结):真 GET /api/skills 的 5 类分组;点击即以该技能开启共创 */

const CAT_COLORS: Record<string, string> = {
  概念与方案: '#7fb3cf',
  竞品与研究: '#4f7f9e',
  文本与汇报: '#a8cfe0',
  出图与表现: '#5f93ad',
  审查与合规: '#cf7f7f',
}

export function SkillLibraryPanel({
  open,
  onClose,
  cats,
  loading,
  err,
  onPick,
}: {
  open: boolean
  onClose: () => void
  cats: [string, Skill[]][]
  loading: boolean
  err: string | null
  onPick: (skillId: string) => void
}) {
  if (!open) return null
  const total = cats.reduce((n, [, list]) => n + list.length, 0)
  return (
    <div
      className="absolute inset-0 z-skoverlay flex items-center justify-center bg-[rgba(6,8,10,.55)] backdrop-blur-[6px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="sk-scroll max-h-[78%] w-[min(880px,88%)] overflow-y-auto rounded-skcomposer border-[0.5px] border-sk-border bg-[rgba(10,12,14,.94)] p-[26px] px-[30px]">
        <div className="mb-[18px] flex items-baseline gap-3">
          <CardHead title="全部技能" en="Skill Library" />
          <span className="ml-auto flex items-center gap-3">
            <Pill>{loading ? '加载中…' : `${total} 项在编 · 点击即以该技能开启共创`}</Pill>
            <GhostButton className="px-3.5 py-[5px]" onClick={onClose}>
              关闭
            </GhostButton>
          </span>
        </div>
        {err && <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-risk">技能目录加载失败:{err}</div>}
        {!loading && !err && cats.length === 0 && (
          <div className="py-2 font-skcjk text-[12.5px] font-light text-sk-muted">暂无技能。检查后端连接后重新打开此面板。</div>
        )}
        {cats.map(([cat, list]) => (
          <div key={cat} className="mb-4">
            <div className="mb-[9px] flex items-center gap-2 font-skcjk text-[12.5px] font-normal tracking-[0.12em] text-sk-fg">
              <i className="inline-block h-[7px] w-[7px] rounded-[2px]" style={{ background: list[0]?.color || CAT_COLORS[cat] || '#7fb3cf' }} />
              {cat}
              <span className="text-[10.5px] font-light text-sk-muted2">{list.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {list.map((s) => (
                <button
                  key={s.id}
                  className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-[15px] py-1.5 font-skcjk text-[12px] font-light tracking-[0.1em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                  title={s.source}
                  onClick={() => onPick(s.id)}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

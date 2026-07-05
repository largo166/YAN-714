import { SKILL_LIB } from '../../data/skills.mock'
import { CardHead } from '../common/GlassCard'
import { GhostButton, Pill } from '../common/PillButton'

/** 技能库全屏浮层(二级态:5 类 22 项,点击即以该技能开启共创) */
export function SkillLibraryPanel({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (skill: string) => void
}) {
  if (!open) return null
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
            <Pill>22 项在编 · 点击即以该技能开启共创</Pill>
            <GhostButton className="px-3.5 py-[5px]" onClick={onClose}>
              关闭
            </GhostButton>
          </span>
        </div>
        {SKILL_LIB.map((cat) => (
          <div key={cat.c} className="mb-4">
            <div className="mb-[9px] flex items-center gap-2 font-skcjk text-[12.5px] font-normal tracking-[0.12em] text-sk-fg">
              <i className="inline-block h-[7px] w-[7px] rounded-[2px]" style={{ background: cat.col }} />
              {cat.c}
            </div>
            <div className="flex flex-wrap gap-2">
              {cat.items.map((n) => (
                <button
                  key={n}
                  className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-[15px] py-1.5 font-skcjk text-[12px] font-light tracking-[0.1em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
                  onClick={() => onPick(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

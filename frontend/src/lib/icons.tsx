import type { ReactNode } from 'react'
import {
  Boxes, Building2, Clapperboard, ClipboardCheck, FileSearch, Film,
  ImagePlus, Languages, LayoutTemplate, Library, ListOrdered, ListTodo, Mic,
  Palette, PenLine, Presentation, Scale, ShieldCheck, Sparkles, Target, Timer,
  Workflow,
} from 'lucide-react'

/** 技能 id → 统一线性图标(lucide)。后端 icon 字段保留作 fallback——
 *  前端映射统一视觉粗细,不动后端契约(P1-5 图标统一)。 */
const SKILL_ICONS: Record<string, typeof Sparkles> = {
  concept: Sparkles,
  massing: Boxes,
  compare: Scale,
  facade: Building2,
  compete: Target,
  caselib: Library,
  condition: FileSearch,
  ppt: Presentation,
  writer: PenLine,
  brief: ListOrdered,
  poster: LayoutTemplate,
  slang: Languages,
  meeting: Mic,
  img: ImagePlus,
  director: Clapperboard,
  shotlist: Film,
  moodboard: Palette,
  review: ClipboardCheck,
  judge: Timer,
  norm: ShieldCheck,
  task: ListTodo,
  flow: Workflow,
}

/** 渲染技能图标:有映射用 lucide(继承 currentColor),没有回落后端 icon 字符。 */
export function SkillGlyph({ id, fallback, size = 16 }: { id: string; fallback?: ReactNode; size?: number }) {
  const Icon = SKILL_ICONS[id]
  if (!Icon) return <>{fallback ?? '✦'}</>
  return <Icon size={size} strokeWidth={1.8} aria-hidden />
}

/* ═══ 生图工作台抽屉(2026-07-10 拍板 1A/2A/3B) ═══
   1A:共创营地快捷卡「AI 生图」主入口 → 本抽屉(与图片资产池同形态,Portal 到 #sk-overlay)。
   2A:用途闸——必选用途标签(概念/氛围/立面意向/材料板/场景/示范区),不选不放行;
      用途写进后端资产 caption([AI生成·用途])作血缘 v1(used_in 结构化字段等 PPT 底稿实体)。
   3B:张数 1-4,前端并行 N 次 runSkill(img)(后端 n=1 现实);每槽独立 pending/ok/error,可单张重试。
   红线:提示词先出草案可编辑,点「确认生成」才跑,永不静默;keyless→not_configured 人话;
   成图已由后端自动入池(asset_type=render),入池后派发 romai:assets-updated。 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { FileAsset } from '@/lib/api'

import { campService as cs } from '../../services'
import { cn } from '../../lib/cn'
import { CardHead } from '../common/GlassCard'
import { GhostButton, Pill } from '../common/PillButton'
import { Skel } from '../common/Skeleton'

/* 用途标签(2A 用途闸;与产品定义 v1「生图服务什么」对齐) */
const PURPOSES = ['概念图', '氛围图', '立面意向', '材料板', '场景图', '示范区'] as const

interface GenSlot {
  key: number
  status: 'pending' | 'ok' | 'error'
  imagePath: string /* 项目内 stored_path(经 projectImageUrl 取图) */
  model: string
  err: string
}

export function ImageGenDrawer({
  open,
  onClose,
  projectId,
  projectName,
}: {
  open: boolean
  onClose: () => void
  projectId: number | null
  projectName: string
}) {
  /* ── 五段状态 ── */
  const [purpose, setPurpose] = useState<string>('') /* 2A:必选 */
  const [note, setNote] = useState('') /* 可选:服务哪个判断 */
  const [assets, setAssets] = useState<FileAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [assetsErr, setAssetsErr] = useState('')
  const [refIds, setRefIds] = useState<number[]>([]) /* ≤4 */
  const [intent, setIntent] = useState('') /* 中文意图 */
  const [draftPrompt, setDraftPrompt] = useState('') /* 英文草案(可编辑) */
  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState('')
  const [count, setCount] = useState(1) /* 3B:1-4 */
  const [slots, setSlots] = useState<GenSlot[]>([])
  const [running, setRunning] = useState(false)
  const abortsRef = useRef<AbortController[]>([])
  const genSeq = useRef(0)

  /* 打开时拉本项目资产(参考图选择器数据);关闭时若在生成中需确认 */
  useEffect(() => {
    if (!open || projectId == null) return
    let alive = true
    setAssetsLoading(true)
    setAssetsErr('')
    cs.listAssets(projectId)
      .then((r) => alive && setAssets(r.items))
      .catch((e) => alive && setAssetsErr((e as Error).message))
      .finally(() => alive && setAssetsLoading(false))
    return () => {
      alive = false
    }
  }, [open, projectId])

  const toggleRef = useCallback((id: number) => {
    setRefIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 4 ? cur : [...cur, id]))
  }, [])

  /* 提示词草案:复用 /出图 轻确认链路(runCommand → confirm_image 返回 prompt 草案),不静默出图 */
  const makeDraft = useCallback(async () => {
    if (projectId == null || drafting) return
    setDrafting(true)
    setDraftErr('')
    try {
      const r = await cs.runCommand(projectId, `/出图 ${[purpose, note, intent].filter(Boolean).join('，')}`)
      if (r.status === 'confirm_image' && r.prompt) setDraftPrompt(r.prompt)
      else if (r.status === 'not_configured') setDraftErr(r.message || 'AI 未配置,无法扩写。可直接手写英文提示词。')
      else setDraftErr(r.message || '扩写未返回草案。可直接手写英文提示词。')
    } catch (e) {
      setDraftErr((e as Error).message)
    } finally {
      setDrafting(false)
    }
  }, [projectId, drafting, purpose, note, intent])

  /* 确认生成(3B):并行 N 次 runSkill('img'),每槽独立结算;可取消 */
  const confirmGenerate = useCallback(async () => {
    if (projectId == null || running || !purpose || !draftPrompt.trim()) return
    const gen = ++genSeq.current
    setRunning(true)
    const n = Math.min(4, Math.max(1, count))
    const base = Array.from({ length: n }, (_, i) => ({ key: gen * 10 + i, status: 'pending' as const, imagePath: '', model: '', err: '' }))
    setSlots(base)
    abortsRef.current = base.map(() => new AbortController())
    await Promise.allSettled(
      base.map((slot, i) =>
        cs
          .runSkill(projectId, 'img', intent, '', 0, draftPrompt.trim(), '', '', refIds, purpose + (note ? `·${note}` : ''), abortsRef.current[i]?.signal)
          .then((r) => {
            if (genSeq.current !== gen) return
            setSlots((cur) =>
              cur.map((s) =>
                s.key === slot.key
                  ? r.status === 'ok' && r.image_url
                    ? { ...s, status: 'ok', imagePath: r.image_url, model: r.image_model }
                    : { ...s, status: 'error', err: r.error_message || r.content || '生图失败(不伪造)。' }
                  : s,
              ),
            )
          })
          .catch((e) => {
            if (genSeq.current !== gen) return
            setSlots((cur) => cur.map((s) => (s.key === slot.key ? { ...s, status: 'error', err: (e as Error).message } : s)))
          }),
      ),
    )
    if (genSeq.current === gen) {
      setRunning(false)
      /* 成图已由后端入池 → 广播资产变更(事件命名约定),资产池/消费者刷新 */
      window.dispatchEvent(new CustomEvent('romai:assets-updated'))
    }
  }, [projectId, running, purpose, note, draftPrompt, count, intent, refIds])

  /* 单槽重试(同参数重跑一次) */
  const retrySlot = useCallback(
    async (key: number) => {
      if (projectId == null) return
      setSlots((cur) => cur.map((s) => (s.key === key ? { ...s, status: 'pending', err: '' } : s)))
      try {
        const r = await cs.runSkill(projectId, 'img', intent, '', 0, draftPrompt.trim(), '', '', refIds, purpose + (note ? `·${note}` : ''))
        setSlots((cur) =>
          cur.map((s) =>
            s.key === key
              ? r.status === 'ok' && r.image_url
                ? { ...s, status: 'ok', imagePath: r.image_url, model: r.image_model }
                : { ...s, status: 'error', err: r.error_message || r.content || '生图失败(不伪造)。' }
              : s,
          ),
        )
        window.dispatchEvent(new CustomEvent('romai:assets-updated'))
      } catch (e) {
        setSlots((cur) => cur.map((s) => (s.key === key ? { ...s, status: 'error', err: (e as Error).message } : s)))
      }
    },
    [projectId, intent, draftPrompt, refIds, purpose, note],
  )

  const cancelAll = useCallback(() => {
    genSeq.current++ /* 令旧回调失效 */
    abortsRef.current.forEach((a) => a.abort())
    setSlots((cur) => cur.map((s) => (s.status === 'pending' ? { ...s, status: 'error', err: '已取消' } : s)))
    setRunning(false)
  }, [])

  const tryClose = useCallback(() => {
    if (running && !window.confirm('生成仍在进行,关闭将取消未完成的槽位。确定关闭?')) return
    if (running) cancelAll()
    onClose()
  }, [running, cancelAll, onClose])

  if (!open) return null
  const overlay = document.getElementById('sk-overlay')
  if (!overlay) return null

  const canDraft = projectId != null && !!purpose && (!!intent.trim() || !!note.trim() || !!purpose)
  const canGenerate = projectId != null && !!purpose && !!draftPrompt.trim() && !running

  return createPortal(
    <div
      className="absolute inset-0 z-skoverlay flex justify-end bg-[rgba(6,8,10,.5)] backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) tryClose()
      }}
      data-testid="imggen-drawer"
    >
      <div className="pointer-events-auto flex h-full w-[min(880px,94vw)] flex-col overflow-hidden border-l-[0.5px] border-sk-border bg-[rgba(10,12,14,.97)] shadow-skpop">
        {/* 头部 */}
        <div className="flex-none border-b-[0.5px] border-sk-hairsoft px-6 pb-3 pt-5">
          <CardHead
            title="AI 生图 · 意向图"
            en="Image Studio"
            right={<GhostButton className="px-3 py-1" onClick={tryClose}>关闭</GhostButton>}
          />
          <div className="mt-2 font-skcjk text-[11.5px] tracking-[0.04em] text-sk-muted2">
            {projectId == null ? '请先在项目中心选择作用项目' : (
              <>当前项目 · <span className="text-sk-muted">{projectName || `#${projectId}`}</span> · 生成图自动入图片资产池并标「AI生成」</>
            )}
          </div>
        </div>

        <div className="sk-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {projectId == null ? (
            <div className="py-8 font-skcjk text-[12.5px] font-light text-sk-muted">
              暂无作用项目。到项目中心选择项目后,这里即可用项目素材生成意向图。
            </div>
          ) : (
            <>
              {/* ① 用途闸(2A:必选,不选不放行) */}
              <SectionTitle no="①" title="这张图服务什么" must />
              <div className="mt-2 flex flex-wrap gap-2">
                {PURPOSES.map((p) => (
                  <button
                    key={p}
                    className={cn(
                      'cursor-pointer rounded-full border-[0.5px] px-3.5 py-[5px] font-skcjk text-[11.5px] font-light transition-colors',
                      purpose === p
                        ? 'border-[rgba(127,179,207,.55)] bg-[rgba(127,179,207,.1)] text-sk-primary'
                        : 'border-sk-hairsoft text-sk-muted2 hover:text-sk-primary',
                    )}
                    onClick={() => setPurpose((cur) => (cur === p ? '' : p))}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                className="mt-2.5 w-full border-0 border-b border-sk-hairsoft bg-transparent pb-1.5 font-skcjk text-[12px] font-light text-sk-fg outline-none placeholder:text-sk-muted2 focus:border-sk-primary"
                placeholder="(可选)服务哪个判断/哪页汇报,如「沿街商业连续性策略页」"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {!purpose && (
                <div className="mt-1.5 font-skcjk text-[10.5px] font-light text-sk-warn">先选用途才能继续——每张生成图都要有主(不做无主漂浮图)。</div>
              )}

              {/* ② 参考图(项目资产池,≤4;可不选=纯文生图) */}
              <SectionTitle no="②" title={`参考图(可选,已选 ${refIds.length}/4)`} className="mt-6" />
              {assetsLoading && (
                <div className="mt-2 flex gap-2">{[0, 1, 2, 3].map((i) => <Skel key={i} style={{ width: 92, height: 64 }} />)}</div>
              )}
              {assetsErr && <div className="mt-2 font-skcjk text-[11.5px] font-light text-sk-risk">资产加载失败:{assetsErr}</div>}
              {!assetsLoading && !assetsErr && assets.length === 0 && (
                <div className="mt-2 font-skcjk text-[11.5px] font-light text-sk-muted2">本项目暂无图片资产——可直接纯文字生成;入库更多资料后可作参考图。</div>
              )}
              {assets.length > 0 && (
                <div className="sk-scroll mt-2 flex max-h-[128px] flex-wrap gap-2 overflow-y-auto">
                  {assets.map((a) => {
                    const sel = refIds.includes(a.id)
                    return (
                      <button
                        key={a.id}
                        className={cn(
                          'relative h-16 w-[92px] flex-none cursor-pointer overflow-hidden rounded-[9px] border transition-all',
                          sel ? 'border-[rgba(127,179,207,.7)] shadow-[0_0_10px_rgba(127,179,207,.25)]' : 'border-sk-hairsoft opacity-75 hover:opacity-100',
                        )}
                        title={a.caption || `资产#${a.id}`}
                        onClick={() => toggleRef(a.id)}
                      >
                        <img src={cs.assetThumbUrl(projectId, a.id)} alt="" className="h-full w-full object-cover" loading="lazy" />
                        {sel && <span className="absolute right-1 top-1 rounded-full bg-sk-primary px-1.5 font-sans text-[9px] text-[#0a0c0e]">{refIds.indexOf(a.id) + 1}</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* ③ 提示词(中文意图 → 扩写英文草案,可编辑;或直接手写) */}
              <SectionTitle no="③" title="提示词" className="mt-6" />
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="min-w-0 flex-1 border-0 border-b border-sk-hairsoft bg-transparent pb-1.5 font-skcjk text-[12.5px] font-light text-sk-fg outline-none placeholder:text-sk-muted2 focus:border-sk-primary"
                  placeholder="用中文描述画面意图,如「沿城市道路的 18 层板楼社区,黄昏,体块模型感」"
                  value={intent}
                  onChange={(e) => setIntent(e.target.value)}
                />
                <GhostButton className="flex-none px-3 py-1 text-[10.5px]" onClick={() => void makeDraft()} disabled={!canDraft || drafting}>
                  {drafting ? '扩写中…' : 'AI 扩写草案'}
                </GhostButton>
              </div>
              {draftErr && <div className="mt-1.5 font-skcjk text-[11px] font-light text-sk-risk">{draftErr}</div>}
              <textarea
                className="sk-scroll mt-2.5 h-[88px] w-full resize-none rounded-[10px] border-[0.5px] border-sk-hairsoft bg-[rgba(242,241,238,.02)] p-2.5 font-skmono text-[11.5px] leading-[1.6] text-sk-fg outline-none placeholder:text-sk-muted2 focus:border-[rgba(127,179,207,.4)]"
                placeholder="英文提示词草案(AI 扩写后出现在这里,可编辑;也可直接手写)"
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
              />

              {/* ④ 确认闸(模型只读 + 张数 1-4 + 诚实计数) */}
              <SectionTitle no="④" title="确认生成" className="mt-6" />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Pill>模型 · {refIds.length > 0 ? 'gemini(图生图)' : '默认 gemini'}</Pill>
                <span className="font-skcjk text-[11.5px] font-light text-sk-muted2">张数</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      className={cn(
                        'h-7 w-7 cursor-pointer rounded-[8px] border-[0.5px] font-sans text-[12px] transition-colors',
                        count === n ? 'border-[rgba(127,179,207,.55)] bg-[rgba(127,179,207,.1)] text-sk-primary' : 'border-sk-hairsoft text-sk-muted2 hover:text-sk-primary',
                      )}
                      onClick={() => setCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="font-skcjk text-[10.5px] font-light text-sk-muted2">将发起 {count} 次生图调用(约 25s/张,消耗 API 额度)</span>
                <div className="ml-auto flex gap-2">
                  {running && <GhostButton className="px-3.5 py-1.5 text-[11px]" onClick={cancelAll}>取消</GhostButton>}
                  <GhostButton pri className="px-4 py-1.5" onClick={() => void confirmGenerate()} disabled={!canGenerate}>
                    {running ? '生成中…' : `确认生成(${count})`}
                  </GhostButton>
                </div>
              </div>

              {/* ⑤ 结果队列(3B:N 槽独立三态;成图已自动入池) */}
              {slots.length > 0 && (
                <>
                  <SectionTitle no="⑤" title="结果(自动入池 · 标「AI生成」)" className="mt-6" />
                  <div className="mt-2 grid grid-cols-2 gap-3 pb-4">
                    {slots.map((s) => (
                      <div key={s.key} className="relative overflow-hidden rounded-[12px] border-[0.5px] border-sk-hairsoft bg-[rgba(242,241,238,.02)]">
                        {s.status === 'pending' && (
                          <div className="flex h-[180px] flex-col items-center justify-center gap-2">
                            <Skel style={{ width: '72%', height: 96 }} />
                            <span className="sk-pulse font-skcjk text-[11px] font-light text-sk-muted2">生成中…(约 25s)</span>
                          </div>
                        )}
                        {s.status === 'ok' && (
                          <>
                            <img src={cs.projectImageUrl(projectId, s.imagePath)} alt="AI 生成意向图" className="h-[180px] w-full object-cover" />
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <Pill tone="pri">AI生成 · {purpose}</Pill>
                              <span className="truncate font-skcjk text-[10px] font-light text-sk-muted2">{s.model}</span>
                              <button
                                className="ml-auto flex-none cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft px-2.5 py-[3px] font-skcjk text-[10px] font-light text-sk-muted hover:text-sk-primary"
                                onClick={() => void retrySlot(s.key)}
                              >
                                重新生成
                              </button>
                            </div>
                          </>
                        )}
                        {s.status === 'error' && (
                          <div className="flex h-[180px] flex-col items-center justify-center gap-2 px-4">
                            <span className="text-center font-skcjk text-[11px] font-light leading-[1.6] text-sk-risk">{s.err}</span>
                            <GhostButton className="px-3 py-1 text-[10.5px]" onClick={() => void retrySlot(s.key)}>重试 ↻</GhostButton>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    overlay,
  )
}

function SectionTitle({ no, title, must, className }: { no: string; title: string; must?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className="font-sans text-[10px] text-sk-primary">{no}</span>
      <span className="font-skcjk text-[12.5px] font-normal tracking-[0.08em] text-sk-fg">{title}</span>
      {must && <span className="font-skcjk text-[10px] font-light text-sk-warn">必选</span>}
    </div>
  )
}

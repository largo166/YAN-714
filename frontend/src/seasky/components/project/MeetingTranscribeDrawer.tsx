import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import type {
  MeetingDetail,
  MeetingMinute,
  TranscribeCapability,
  TranscribeJob,
} from '@/types/schemas'

import { projectService as ps } from '../../services'
import { CardHead } from '../common/GlassCard'
import { GhostButton, Label, Pill, Dot } from '../common/PillButton'

/* ═══ 会议录音转写抽屉(海天全高抽屉 · Portal 到 #sk-overlay) ═══
   单抽屉四步内部态:
   ① 入口(idle):上传录音起异步 job / 上传文本直建会议;能力行如实(引擎+分离)。
   ② 转写中(running):十态进度,反映真实 job.stage,不假死不假进度;上传阶段显真实 %。
   ③ 转写预览+说话人映射(done):真 transcript;人工确认 speaker(系统不猜身份);生成纪要。
   ④ 纪要结果(minute):按 gen_status 三态诚实;待办 0 条也如实显示,不藏。
   轮询每 ~1.5s,phase!=='running' 即停;finished 标志防「关闭后迟到轮询 setState」(镜像 CleanupWizard)。 */

type DrawerStep = 0 | 1 | 2 | 3

const POLL_MS = 1500

/* 十态顺序(与后端中文 stage 名对应):前两态为前端上传阶段,其余映射 job.stage。 */
const PHASE_STEPS = [
  { key: 'wait', label: '等待上传' },
  { key: 'upload', label: '上传中' },
  { key: '检查文件', label: '检查文件' },
  { key: '检查/下载模型', label: '检查/下载模型' },
  { key: '转写中', label: '转写中' },
  { key: '说话人分离中', label: '说话人分离中' },
  { key: '写入项目库', label: '写入项目库' },
  { key: '完成', label: '完成' },
] as const

const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.flac,.webm'
const TEXT_ACCEPT = '.txt,.md'

function fmtMs(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

interface DrawerProps {
  open: boolean
  onClose: () => void
  projectId: number | null
  projectName?: string
}

export function MeetingTranscribeDrawer({ open, onClose, projectId, projectName }: DrawerProps) {
  const [step, setStep] = useState<DrawerStep>(0)
  const [title, setTitle] = useState('')

  /* 能力探测(打开时拉一次) */
  const [cap, setCap] = useState<TranscribeCapability | null>(null)

  /* 通用忙/错 */
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  /* 步骤① → 上传 */
  const [uploadPct, setUploadPct] = useState(0)

  /* 步骤② → 转写 job */
  const [job, setJob] = useState<TranscribeJob | null>(null)

  /* 步骤③ → 会议详情 + 说话人改名草稿 */
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [renames, setRenames] = useState<Record<string, string>>({})

  /* 步骤④ → 纪要 */
  const [minute, setMinute] = useState<MeetingMinute | null>(null)
  const [minuteMade, setMinuteMade] = useState(false) /* 曾成功出过纪要 → 关闭时广播刷新 */

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishedRef = useRef(false) /* 迟到轮询守卫:关闭/终态后置真,回调不再 setState */
  const audioInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  /* 全量复位(打开/重试回到入口) */
  const reset = useCallback(() => {
    stopPoll()
    finishedRef.current = false
    setStep(0)
    setBusy('')
    setErr('')
    setUploadPct(0)
    setJob(null)
    setMeeting(null)
    setRenames({})
    setMinute(null)
    setMinuteMade(false)
  }, [stopPoll])

  /* 打开:复位 + 拉能力;关闭:止轮询 + 置 finished(守卫迟到回调) */
  useEffect(() => {
    if (open) {
      reset()
      if (projectId != null) {
        ps.transcribeCapability(projectId)
          .then((c) => setCap(c))
          .catch(() => setCap(null))
      } else {
        setCap(null)
      }
    } else {
      finishedRef.current = true
      stopPoll()
    }
  }, [open, projectId, reset, stopPoll])

  /* 卸载兜底:清轮询 */
  useEffect(() => () => { stopPoll() }, [stopPoll])

  /* 拉会议详情 → 进步骤③,并按 segments 建 speaker 改名草稿(空串) */
  const loadMeeting = useCallback(
    async (meetingId: number) => {
      if (projectId == null) return
      setBusy('meeting')
      setErr('')
      try {
        const m = await ps.getMeeting(projectId, meetingId)
        if (finishedRef.current && !open) return
        setMeeting(m)
        setStep(2)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setBusy('')
      }
    },
    [projectId, open],
  )

  /* 启动转写 job 的轮询(每 ~1.5s;phase!=='running' 即停) */
  const startPolling = useCallback(
    (jobId: string) => {
      if (projectId == null) return
      stopPoll()
      finishedRef.current = false
      pollRef.current = setInterval(async () => {
        if (finishedRef.current) return
        try {
          const j = await ps.transcribeJobStatus(projectId, jobId)
          if (finishedRef.current) return
          setJob(j)
          if (j.phase !== 'running') {
            finishedRef.current = true
            stopPoll()
            if (j.phase === 'done' && j.meeting_id) {
              void loadMeeting(j.meeting_id)
            }
          }
        } catch (e) {
          /* 单次轮询失败不立刻判死:保留 job 现状,等下一拍;真·致命由后端 phase=failed 表达 */
          void e
        }
      }, POLL_MS)
    },
    [projectId, stopPoll, loadMeeting],
  )

  /* 步骤① · 上传录音 → 起 job → 进步骤② */
  const onPickAudio = useCallback(
    async (file: File) => {
      if (projectId == null) return
      finishedRef.current = false
      setErr('')
      setUploadPct(0)
      setBusy('audio')
      setJob({ job_id: '', phase: 'running', stage: '', note: '', meeting_id: 0, error: '' })
      setStep(1)
      try {
        const j = await ps.createMeetingFromAudio(
          projectId,
          file,
          { title: title.trim() || '未命名会议' },
          (pct) => setUploadPct(pct),
        )
        setJob(j)
        if (j.phase === 'failed') {
          finishedRef.current = true
        } else if (j.phase === 'done' && j.meeting_id) {
          finishedRef.current = true
          void loadMeeting(j.meeting_id)
        } else {
          startPolling(j.job_id)
        }
      } catch (e) {
        finishedRef.current = true
        setErr((e as Error).message)
        setJob({ job_id: '', phase: 'failed', stage: '失败', note: '', meeting_id: 0, error: (e as Error).message })
      } finally {
        setBusy('')
      }
    },
    [projectId, title, loadMeeting, startPolling],
  )

  /* 步骤① · 上传文本 → 直建会议(无 job)→ 进步骤③ */
  const onPickText = useCallback(
    async (file: File) => {
      if (projectId == null) return
      setErr('')
      setBusy('text')
      try {
        const m = await ps.createMeetingFromMaterial(projectId, file, { title: title.trim() || '未命名会议' })
        setMeeting(m)
        setStep(2)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setBusy('')
      }
    },
    [projectId, title],
  )

  /* 步骤③ · 应用说话人映射(仅非空改名)→ 刷新会议 */
  const applyRenames = useCallback(async () => {
    if (projectId == null || !meeting) return
    const mapping: Record<string, string> = {}
    for (const [k, v] of Object.entries(renames)) {
      const t = v.trim()
      if (t) mapping[k] = t
    }
    if (Object.keys(mapping).length === 0) return
    setBusy('map')
    setErr('')
    try {
      const m = await ps.updateSpeakerMap(projectId, meeting.id, mapping)
      setMeeting(m)
      setRenames({})
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }, [projectId, meeting, renames])

  /* 步骤③ → ④ · 生成纪要 */
  const doGenerate = useCallback(async () => {
    if (projectId == null || !meeting) return
    setBusy('minute')
    setErr('')
    try {
      const mn = await ps.generateMinute(projectId, meeting.id)
      setMinute(mn)
      setMinuteMade(true)
      setStep(3)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }, [projectId, meeting])

  /* 关闭:出过纪要则广播,让会议卡刷新 */
  const handleClose = useCallback(() => {
    if (minuteMade) window.dispatchEvent(new CustomEvent('romai:meetings-updated'))
    onClose()
  }, [minuteMade, onClose])

  if (!open) return null
  const overlay = document.getElementById('sk-overlay')
  if (!overlay) return null

  const locked = projectId == null

  /* ── 步骤条(不可点跳,仅示当前位置;转写中禁止误触关闭) ── */
  const running = step === 1 && job?.phase === 'running'
  const stepDot = (n: DrawerStep, label: string) => {
    const active = step === n
    const done = step > n
    return (
      <div key={n} className="flex items-center gap-2">
        <span
          className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] ${
            active ? 'border-sk-primary text-sk-primary' : done ? 'border-sk-ok text-sk-ok' : 'border-sk-hair text-sk-muted2'
          }`}
        >
          {done ? '✓' : n + 1}
        </span>
        <span className={`font-skcjk text-[12px] ${active ? 'text-sk-fg' : 'text-sk-muted2'}`}>{label}</span>
      </div>
    )
  }

  /* ── 步骤②进度派生:当前处在十态的哪一格 ── */
  const currentStageIndex = (): number => {
    if (busy === 'audio' && (!job || !job.stage)) return uploadPct >= 100 ? 2 : 1 /* 上传中 */
    const st = job?.stage ?? ''
    const idx = PHASE_STEPS.findIndex((p) => p.key === st)
    if (idx >= 0) return idx
    if (job?.phase === 'done') return PHASE_STEPS.length - 1
    return 1 /* 尚未收到 stage:视作上传/起步 */
  }

  /* ── 步骤③:从 segments 收集去重 speaker_key(保序) ── */
  const speakerKeys: string[] = (() => {
    if (!meeting) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of meeting.segments) {
      if (s.speaker_key && !seen.has(s.speaker_key)) {
        seen.add(s.speaker_key)
        out.push(s.speaker_key)
      }
    }
    return out
  })()

  return createPortal(
    <div
      className="absolute inset-0 z-skoverlay flex justify-end bg-[rgba(6,8,10,.5)] backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !running) handleClose()
      }}
    >
      <div className="sk-scroll pointer-events-auto flex h-full w-[min(560px,94vw)] flex-col overflow-y-auto border-l-[0.5px] border-sk-border bg-[rgba(10,12,14,.97)] shadow-skpop">
        {/* 顶部:标题 + 步骤条 + 当前项目 */}
        <div className="flex-none border-b-[0.5px] border-sk-hairsoft px-6 pb-3 pt-5">
          <CardHead
            title="会议录音转写"
            en="Meeting Transcribe"
            right={<GhostButton className="px-3 py-1" disabled={running} onClick={handleClose}>关闭</GhostButton>}
          />
          <div className="mt-2 font-skcjk text-[11.5px] tracking-[0.04em] text-sk-muted2">
            {locked ? '请先选择项目' : <>当前项目 · <span className="text-sk-muted">{projectName || `#${projectId}`}</span></>}
          </div>
          <div className="mt-3 flex items-center gap-4">
            {stepDot(0, '入口')}
            <span className="h-px w-5 bg-sk-hairsoft" />
            {stepDot(1, '转写')}
            <span className="h-px w-5 bg-sk-hairsoft" />
            {stepDot(2, '预览')}
            <span className="h-px w-5 bg-sk-hairsoft" />
            {stepDot(3, '纪要')}
          </div>
        </div>

        <div className="flex-1 px-6 py-5">
          {/* ═══ 步骤① 入口 ═══ */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              {/* 会议主题 */}
              <div className="flex flex-col gap-2">
                <Label>会议主题(可选)</Label>
                <input
                  className="rounded-skcard border-[0.5px] border-sk-hairsoft bg-transparent px-3 py-2 font-skcjk text-[12.5px] text-sk-fg outline-none transition-colors placeholder:text-sk-muted2 focus:border-[rgba(127,179,207,.5)]"
                  placeholder="未命名会议"
                  value={title}
                  disabled={locked}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* 两个入口:上传录音 / 上传文本 */}
              <div className="flex gap-3">
                <button
                  className="flex flex-1 flex-col items-center gap-1.5 rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card px-3 py-5 transition-all duration-200 enabled:hover:border-[rgba(127,179,207,.5)] enabled:hover:shadow-[0_0_14px_rgba(127,179,207,.1)] disabled:opacity-45"
                  disabled={locked || busy !== ''}
                  onClick={() => audioInputRef.current?.click()}
                >
                  <span className="font-skcjk text-[13px] tracking-[0.08em] text-sk-fg">上传录音</span>
                  <span className="font-skcjk text-[10.5px] font-light tracking-[0.04em] text-sk-muted2">mp3 / wav / m4a / flac / webm</span>
                </button>
                <button
                  className="flex flex-1 flex-col items-center gap-1.5 rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card px-3 py-5 transition-all duration-200 enabled:hover:border-[rgba(127,179,207,.5)] enabled:hover:shadow-[0_0_14px_rgba(127,179,207,.1)] disabled:opacity-45"
                  disabled={locked || busy !== ''}
                  onClick={() => textInputRef.current?.click()}
                >
                  <span className="font-skcjk text-[13px] tracking-[0.08em] text-sk-fg">上传文本</span>
                  <span className="font-skcjk text-[10.5px] font-light tracking-[0.04em] text-sk-muted2">txt / md · 已有文字稿</span>
                </button>
              </div>
              {busy === 'text' && <div className="font-skcjk text-[11.5px] text-sk-primary">正在建立会议…</div>}

              {/* 能力行(引擎 + 说话人分离),如实 */}
              <div className="flex flex-col gap-1.5 rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card px-3.5 py-3">
                {cap == null ? (
                  <span className="font-skcjk text-[11.5px] font-light text-sk-muted2">{locked ? '选择项目后检测转写引擎' : '检测转写引擎…'}</span>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      {cap.ready ? (
                        <>
                          <Dot tone="ok" />
                          <span className="font-skcjk text-[11.5px] text-sk-ok">转写引擎就绪</span>
                        </>
                      ) : cap.deps && !cap.model ? (
                        <span className="font-skcjk text-[11.5px] font-light text-sk-warn">首次使用将下载转写模型(约 1.6GB)</span>
                      ) : (
                        <span className="font-skcjk text-[11.5px] font-light text-sk-muted">{cap.reason || '转写引擎未就绪'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {cap.diarize_ready ? (
                        <>
                          <Dot tone="ok" />
                          <span className="font-skcjk text-[11.5px] text-sk-ok">说话人分离就绪</span>
                        </>
                      ) : (
                        <span className="font-skcjk text-[11.5px] font-light text-sk-muted">{cap.diarize_reason || '说话人分离未就绪'}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ═══ 步骤② 转写中 ═══ */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              {job?.phase === 'failed' ? (
                <>
                  <div className="rounded-skcard border-[0.5px] border-[rgba(207,127,127,.32)] bg-[rgba(207,127,127,.05)] p-4">
                    <div className="flex items-center gap-2"><Dot tone="risk" /><span className="font-skcjk text-[12.5px] font-medium text-sk-risk">转写失败</span></div>
                    <div className="mt-2 break-all font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-risk">{job.error || err || '未知错误'}</div>
                  </div>
                  <div><GhostButton pri onClick={reset}>重试</GhostButton></div>
                </>
              ) : (
                <>
                  {/* 竖向 stepper:反映真实 job.stage,当前格高亮 */}
                  <div className="flex flex-col">
                    {PHASE_STEPS.map((p, i) => {
                      const cur = currentStageIndex()
                      const isDone = i < cur
                      const isActive = i === cur
                      return (
                        <div key={p.key} className="flex items-start gap-3 py-1.5">
                          <span
                            className={`mt-[1px] grid h-[18px] w-[18px] flex-none place-items-center rounded-full border text-[10px] ${
                              isActive ? 'border-sk-primary text-sk-primary' : isDone ? 'border-sk-ok text-sk-ok' : 'border-sk-hair text-sk-muted2'
                            }`}
                          >
                            {isDone ? '✓' : i + 1}
                          </span>
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className={`font-skcjk text-[12px] tracking-[0.04em] ${isActive ? 'text-sk-fg' : isDone ? 'text-sk-muted' : 'text-sk-muted2'}`}>
                              {p.label}
                              {isActive && p.key === 'upload' && (
                                <span className="ml-2 font-sans text-[11px] text-sk-primary [font-variant-numeric:tabular-nums]">{uploadPct}%</span>
                              )}
                            </span>
                            {/* 当前格的 note 作为子说明(如「已分离 2 位说话人」) */}
                            {isActive && job?.note && (
                              <span className="font-skcjk text-[10.5px] font-light text-sk-muted2">{job.note}</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="font-skcjk text-[11.5px] font-light text-sk-primary">
                    {job?.stage ? `当前:${job.stage}` : uploadPct < 100 ? '上传中…' : '处理中…'}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ 步骤③ 转写预览 + 说话人映射 ═══ */}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {busy === 'meeting' && !meeting ? (
                <div className="py-6 text-center font-skcjk text-[12.5px] text-sk-muted2">加载中…</div>
              ) : !meeting ? (
                <div className="py-6 text-center font-skcjk text-[12.5px] text-sk-muted">暂无会议内容。请返回入口重新上传。</div>
              ) : (
                <>
                  {/* 说话人映射编辑器 */}
                  <div className="flex flex-col gap-2.5 rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card p-4">
                    <Label>说话人确认</Label>
                    <div className="font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">
                      系统已完成说话人分离,但不会自动判断真实身份。请在生成正式纪要前手动确认。
                    </div>
                    {speakerKeys.length === 0 ? (
                      <div className="font-skcjk text-[11.5px] font-light text-sk-muted2">暂无可识别的说话人。下一步:可直接生成纪要。</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {speakerKeys.map((k) => (
                          <div key={k} className="flex items-center gap-2.5">
                            <span className="w-[72px] flex-none truncate font-skmono text-[11px] text-sk-muted2">{k}</span>
                            <input
                              className="min-w-0 flex-1 rounded-[9px] border-[0.5px] border-sk-hairsoft bg-transparent px-2.5 py-1.5 font-skcjk text-[11.5px] text-sk-fg outline-none transition-colors placeholder:text-sk-muted2 focus:border-[rgba(127,179,207,.5)]"
                              placeholder="甲方王总 / 曦总 / 我方严总"
                              value={renames[k] ?? ''}
                              onChange={(e) => setRenames((prev) => ({ ...prev, [k]: e.target.value }))}
                            />
                          </div>
                        ))}
                        <div className="mt-1">
                          <GhostButton
                            disabled={busy === 'map' || Object.values(renames).every((v) => !v.trim())}
                            onClick={applyRenames}
                          >
                            {busy === 'map' ? '应用中…' : '应用映射'}
                          </GhostButton>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 转写稿 */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline gap-2">
                      <Label>转写稿</Label>
                      <span className="font-skcjk text-[10.5px] text-sk-muted2">{meeting.segments.length} 段</span>
                    </div>
                    {meeting.segments.length === 0 ? (
                      <div className="rounded-skcard border-[0.5px] border-sk-hairsoft py-6 text-center font-skcjk text-[11.5px] font-light text-sk-muted">
                        暂无转写文字。可能音频过短或为空。
                      </div>
                    ) : (
                      <div className="sk-scroll max-h-[280px] overflow-y-auto rounded-skcard border-[0.5px] border-sk-hairsoft">
                        {meeting.segments.map((s, i) => (
                          <div key={i} className="flex gap-2.5 border-b-[0.5px] border-sk-hairsoft px-3 py-2 last:border-0">
                            <span className="flex-none font-skmono text-[10px] text-sk-primary">[{s.speaker_key}]</span>
                            <span className="min-w-0 flex-1 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">{s.text}</span>
                            <span className="flex-none self-start font-skmono text-[9.5px] text-sk-muted2">{fmtMs(s.start_ms)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-1">
                    <GhostButton pri disabled={busy === 'minute'} onClick={doGenerate}>
                      {busy === 'minute' ? '生成中…' : '生成会议纪要'}
                    </GhostButton>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ 步骤④ 纪要结果 ═══ */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              {!minute ? (
                <div className="py-6 text-center font-skcjk text-[12.5px] text-sk-muted2">加载中…</div>
              ) : minute.gen_status === 'not_configured' ? (
                /* 解耦(bug3):无 key 不生成五段式纪要,但转写稿是资产——直接给看+导出+复制,不卡死 */
                <div className="flex flex-col gap-3">
                  <div className="rounded-skcard border-[0.5px] border-[rgba(201,178,127,.3)] bg-[rgba(201,178,127,.05)] p-4 font-skcjk text-[12px] font-light leading-[1.7] text-sk-warn">
                    未配置 AI 引擎,暂不能生成五段式纪要。<span className="text-sk-muted">但转写稿已保存,可直接查看、复制或导出为 txt。</span>到设置 · AI 引擎填 DeepSeek Key 后,回来点「生成纪要」即可。
                  </div>
                  {meeting && meeting.segments.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Label>转写稿</Label>
                        <GhostButton
                          className="px-3 py-1 text-[10.5px]"
                          onClick={() => { if (meeting) window.open(ps.transcriptTxtUrl(meeting.project_id, meeting.id), '_blank') }}
                        >
                          导出 txt
                        </GhostButton>
                        <GhostButton
                          className="px-3 py-1 text-[10.5px]"
                          onClick={() => {
                            if (!meeting) return
                            const txt = meeting.segments.map((s) => `[${fmtMs(s.start_ms)}] ${s.speaker_key ? s.speaker_key + ': ' : ''}${s.text}`).join('\n')
                            void navigator.clipboard?.writeText(txt)
                          }}
                        >
                          复制全文
                        </GhostButton>
                      </div>
                      <div className="sk-scroll max-h-[320px] overflow-y-auto rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card p-3">
                        {meeting.segments.map((s, i) => (
                          <div key={i} className="mb-1.5 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">
                            <span className="font-skmono text-[10px] text-sk-muted2">[{fmtMs(s.start_ms)}]</span>{' '}
                            {s.speaker_key && <span className="text-sk-primary">{s.speaker_key}:</span>} {s.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : minute.gen_status === 'no_material' ? (
                <div className="rounded-skcard border-[0.5px] border-sk-hairsoft bg-sk-card p-4 font-skcjk text-[12px] font-light leading-[1.7] text-sk-muted">
                  暂无可用于生成纪要的转写内容。请返回上一步确认转写稿非空。
                </div>
              ) : minute.gen_status === 'error' ? (
                <div className="rounded-skcard border-[0.5px] border-[rgba(207,127,127,.32)] bg-[rgba(207,127,127,.05)] p-4">
                  <div className="flex items-center gap-2"><Dot tone="risk" /><span className="font-skcjk text-[12.5px] font-medium text-sk-risk">纪要生成失败</span></div>
                  <div className="mt-2 break-all font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-risk">{minute.error_message || '未知错误'}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* 核心结论 */}
                  {minute.summary.length > 0 && (
                    <MinuteSection title="核心结论">
                      <ul className="flex flex-col gap-1.5">
                        {minute.summary.map((t, i) => (
                          <li key={i} className="flex gap-2 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">
                            <span className="flex-none text-sk-primary">·</span>{t}
                          </li>
                        ))}
                      </ul>
                    </MinuteSection>
                  )}

                  {/* 甲方/领导意见 */}
                  {minute.demand_external.length > 0 && (
                    <MinuteSection title="甲方 / 领导意见">
                      <div className="flex flex-col gap-2">
                        {minute.demand_external.map((d, i) => (
                          <div key={i} className="flex flex-col gap-0.5">
                            <span className="font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-fg">{d.statement}</span>
                            {d.quote && <span className="font-skcjk text-[10.5px] font-light leading-[1.6] text-sk-muted2">「{d.quote}」{d.time ? ` · ${d.time}` : ''}</span>}
                          </div>
                        ))}
                      </div>
                    </MinuteSection>
                  )}

                  {/* 设计调整要求 */}
                  {minute.core_items.length > 0 && (
                    <MinuteSection title="设计调整要求">
                      <ul className="flex flex-col gap-1.5">
                        {minute.core_items.map((t, i) => (
                          <li key={i} className="flex gap-2 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">
                            <span className="flex-none text-sk-primary">·</span>{t}
                          </li>
                        ))}
                      </ul>
                    </MinuteSection>
                  )}

                  {/* 待办事项(0 条也如实显示,不藏) */}
                  <MinuteSection title="待办事项">
                    {minute.todos.length === 0 ? (
                      <div className="font-skcjk text-[11.5px] font-light text-sk-muted2">待办 0 条。</div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {minute.todos.map((t, i) => (
                          <div key={i} className="flex items-baseline gap-2">
                            <span className="flex-none text-sk-primary">·</span>
                            <span className="min-w-0 flex-1 font-skcjk text-[11.5px] font-light leading-[1.7] text-sk-muted">{t.text}</span>
                            {(t.owner || t.due) && (
                              <span className="flex-none font-skcjk text-[10px] text-sk-muted2">
                                {t.owner}{t.owner && t.due ? ' · ' : ''}{t.due}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </MinuteSection>

                  {minute.model && <div className="font-skcjk text-[10px] font-light text-sk-muted2">by {minute.model}</div>}
                </div>
              )}

              <div className="pt-1">
                <GhostButton pri onClick={handleClose}>完成</GhostButton>
              </div>
            </div>
          )}

          {/* 通用错误行(非步骤内已单独渲染的错误) */}
          {err && step !== 1 && step !== 3 && (
            <div className="mt-3 font-skcjk text-[12px] font-light text-sk-risk">{err}</div>
          )}
        </div>

        {/* 隐藏文件选择器 */}
        <input
          ref={audioInputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onPickAudio(f)
          }}
        />
        <input
          ref={textInputRef}
          type="file"
          accept={TEXT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void onPickText(f)
          }}
        />
      </div>
    </div>,
    overlay,
  )
}

/* 纪要小节(标题 + 内容;仅在有内容或需如实显示 0 时渲染) */
function MinuteSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Pill tone="pri">{title}</Pill>
      </div>
      {children}
    </div>
  )
}

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import FolderPicker from '@/components/FolderPicker'

import { LS_KEYS } from '../../lib/constants'
import { lsGet, lsSet } from '../../lib/storage'
import { GhostButton } from '../common/PillButton'

/* ═══ 设置 · 两栏化(P0+ 已批,小样v4确认) ═══
   左栏两分区 IA(Linkly 骨架·海天皮):偏好设置(通用/快捷键/数据隐私/关于)+
   功能(资料路径/项目库/索引/AI引擎/检索/集成·规划)。
   已批取舍:「账户」有意不设(无账户=隐私卖点);MCP 并入「集成(规划)」占位。
   右栏行范式:标题+一句人话说明+右侧控件/态徽标;"规划"标签项不假装已有。
   数据全真:健康/checks 走 /api/knowledge/health;路径走 settings/workspace/inbox 现有端点。 */

type PageKey = 'general' | 'hotkeys' | 'privacy' | 'about' | 'paths' | 'projects' | 'index' | 'ai' | 'search' | 'integrations'

const NAV: { section: string; items: { key: PageKey; label: string; plan?: boolean }[] }[] = [
  {
    section: '偏好设置',
    items: [
      { key: 'general', label: '通用' },
      { key: 'hotkeys', label: '快捷键' },
      { key: 'privacy', label: '数据隐私' },
      { key: 'about', label: '关于' },
    ],
  },
  {
    section: '功能',
    items: [
      { key: 'paths', label: '资料路径' },
      { key: 'projects', label: '项目库' },
      { key: 'index', label: '索引' },
      { key: 'ai', label: 'AI 引擎' },
      { key: 'search', label: '检索' },
      { key: 'integrations', label: '集成', plan: true },
    ],
  },
]

type Health = Awaited<ReturnType<typeof api.knowledgeHealth>> & {
  checks?: { fts: boolean; ocr: boolean; repo_path_set: boolean; repo_path_ok: boolean; last_indexed_at: string }
}

/* ── 行范式原子 ── */
function Row({ title, desc, plan, children }: { title: string; desc: string; plan?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b-[0.5px] border-sk-hairsoft py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-skcjk text-[13px] font-normal tracking-[0.05em] text-sk-fg">
          {title}
          {plan && (
            <span className="rounded-full border-[0.5px] border-sk-hairsoft px-2 py-[1px] font-skcjk text-[9px] font-light tracking-[0.1em] text-sk-muted2">
              规划中
            </span>
          )}
        </div>
        <div className="mt-1 font-skcjk text-[10.5px] font-light leading-[1.65] tracking-[0.04em] text-sk-muted2">{desc}</div>
      </div>
      <div className="flex flex-none items-center gap-2 pt-1">{children}</div>
    </div>
  )
}

function Dot({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'risk' | 'mut' }) {
  const c = { ok: 'text-sk-ok', warn: 'text-sk-warn', risk: 'text-sk-risk', mut: 'text-sk-muted2' }[tone]
  const bg = { ok: 'bg-[#7ec9a5]', warn: 'bg-[#c9b27f]', risk: 'bg-[#cf7f7f]', mut: 'bg-[#a1a5aa]' }[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-sk-hairsoft px-2.5 py-[2px] font-skcjk text-[10px] font-light ${c}`}>
      <i className={`inline-block h-[5px] w-[5px] rounded-full ${bg}`} />
      {text}
    </span>
  )
}

function Sect({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-4 font-sans text-[8.5px] font-medium uppercase tracking-[0.26em] text-sk-muted2">{children}</div>
  )
}

/* 背景偏好三选(极慢粒子/静态/fbm 海);切后广播 romai:bg-updated 即时换,晕动症红线可关 */
function BgToggle() {
  const [v, setV] = useState<string>(() => lsGet(LS_KEYS.bg) || 'particle')
  const pick = (val: string) => {
    setV(val)
    lsSet(LS_KEYS.bg, val)
    window.dispatchEvent(new CustomEvent('romai:bg-updated'))
  }
  const opts: { k: string; label: string }[] = [
    { k: 'particle', label: '粒子海' },
    { k: 'static', label: '静止' },
    { k: 'sea', label: '网点' },
  ]
  return (
    <div className="flex items-center gap-1 rounded-full border-[0.5px] border-sk-hairsoft p-0.5">
      {opts.map((o) => (
        <button
          key={o.k}
          onClick={() => pick(o.k)}
          className={`cursor-pointer rounded-full px-3 py-1 font-skcjk text-[10.5px] font-light tracking-[0.06em] transition-colors ${
            v === o.k ? 'bg-[rgba(127,179,207,.14)] text-sk-fg' : 'text-sk-muted2 hover:text-sk-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PageHead({ cn, en, note }: { cn: string; en: string; note: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b-[0.5px] border-sk-hairsoft pb-3">
      <span className="font-skcjk text-[16px] font-normal tracking-[0.1em] text-sk-fg">{cn}</span>
      <span className="font-sans text-[9px] font-light uppercase tracking-[0.22em] text-sk-muted2">{en}</span>
      <span className="ml-auto font-skcjk text-[10.5px] font-light text-sk-muted2">{note}</span>
    </div>
  )
}

function Kbd({ k }: { k: string }) {
  return (
    <span className="rounded-[6px] border-[0.5px] border-sk-hair px-2 py-[2px] font-sans text-[10px] text-sk-muted">{k}</span>
  )
}

export function SettingsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [page, setPage] = useState<PageKey>('general')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState<'repo' | 'ws' | 'inbox' | null>(null)
  const [keySet, setKeySet] = useState(false)
  const [draft, setDraft] = useState({ key: '', repo: '', ws: '', inbox: '' })
  const [saved, setSaved] = useState({ repo: '', ws: '', inbox: '' })
  const [health, setHealth] = useState<Health | null>(null)
  const [healthBusy, setHealthBusy] = useState(false)
  const [projList, setProjList] = useState<{ id: number; name: string; city: string; client: string }[]>([])
  const [stats, setStats] = useState<{ documents: number; indexed: number; engine: string } | null>(null)
  const [typeStats, setTypeStats] = useState<[string, number][]>([])
  /* B④ 读取态三态:批量拉取失败不再静默吞(此前 allSettled 丢 reject → 永久"…")。
     readErr=失败源如实点名;readVer bump=一键重试。 */
  const [readErr, setReadErr] = useState<string | null>(null)
  const [readVer, setReadVer] = useState(0)

  /* 打开即拉全量(设置/工作目录/收件箱/健康/项目/统计) */
  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      const [s, w, i, h, p, st, docs] = await Promise.allSettled([
        api.getSettings(),
        api.workspaceStatus(),
        api.inboxStatus(),
        api.knowledgeHealth(),
        api.listProjects(),
        api.getKnowledgeStats(),
        api.listKnowledgeDocs(),
      ])
      if (!alive) return
      /* 逐源记错:失败源如实点名(错误≠空值),不再吞 reject 留永久"…" */
      const failed: string[] = []
      const names = ['设置', '工作目录', '收件箱', '库体检', '项目列表', '索引统计', '文档列表'] as const
      ;[s, w, i, h, p, st, docs].forEach((r, idx) => {
        if (r.status === 'rejected') failed.push(names[idx])
      })
      setReadErr(failed.length ? `部分设置数据加载失败——${failed.join('/')}` : null)
      if (s.status === 'fulfilled') {
        setKeySet(s.value.deepseek_api_key_set)
        setSaved((v) => ({ ...v, repo: s.value.repository_root_path ?? '' }))
        setDraft((d) => ({ ...d, repo: s.value.repository_root_path ?? '' }))
      }
      if (w.status === 'fulfilled') {
        setSaved((v) => ({ ...v, ws: w.value.workspace_path ?? '' }))
        setDraft((d) => ({ ...d, ws: w.value.workspace_path ?? '' }))
      }
      if (i.status === 'fulfilled') {
        setSaved((v) => ({ ...v, inbox: i.value.inbox_root_path ?? '' }))
        setDraft((d) => ({ ...d, inbox: i.value.inbox_root_path ?? '' }))
      }
      if (h.status === 'fulfilled') setHealth(h.value as Health)
      if (p.status === 'fulfilled') setProjList(p.value.items as never)
      if (st.status === 'fulfilled') setStats(st.value)
      if (docs.status === 'fulfilled') {
        const m = new Map<string, number>()
        /* A3(2026-07-09 已批):分布条切建筑语义轴 16 类;存量空值(0023 迁移已回填,仅极老行)兜底旧轴 */
        for (const d of docs.value.items as { type?: string; design_doc_type?: string }[]) {
          const t = d.design_doc_type || d.type || '其他'
          m.set(t, (m.get(t) ?? 0) + 1)
        }
        setTypeStats([...m.entries()].sort((a, b) => b[1] - a[1]))
      }
    })()
    return () => {
      alive = false
    }
  }, [open, readVer])

  const save = async () => {
    setBusy(true)
    setMsg('')
    setErr('')
    const done: string[] = []
    try {
      if (draft.key.trim()) {
        await api.updateSettings({ deepseek_api_key: draft.key.trim() })
        done.push('AI Key')
        setDraft((d) => ({ ...d, key: '' }))
        setKeySet(true)
      }
      if (draft.repo.trim() && draft.repo.trim() !== saved.repo) {
        await api.updateSettings({ repository_root_path: draft.repo.trim() })
        done.push('仓库')
      }
      if (draft.ws.trim() !== saved.ws) {
        await api.workspaceConfig(draft.ws.trim())
        done.push('工作目录')
      }
      if (draft.inbox.trim() !== saved.inbox) {
        await api.inboxConfig(draft.inbox.trim())
        done.push('收件箱')
      }
      setMsg(done.length ? `已保存:${done.join(' / ')}` : '没有改动。')
      setSaved({ repo: draft.repo.trim(), ws: draft.ws.trim(), inbox: draft.inbox.trim() })
      if (done.some((d) => d === '仓库' || d === '工作目录' || d === '收件箱')) {
        window.dispatchEvent(new CustomEvent('romai:settings-updated'))
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runHealth = async () => {
    setHealthBusy(true)
    try {
      setHealth((await api.knowledgeHealth()) as Health)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setHealthBusy(false)
    }
  }

  if (!open) return null

  const pathRow = (
    title: string,
    desc: string,
    field: 'repo' | 'ws' | 'inbox',
  ) => (
    <Row title={title} desc={desc}>
      <span className="max-w-[200px] truncate font-skmono text-[10.5px] text-sk-muted">{draft[field] || '未配置'}</span>
      <GhostButton className="px-3 py-[5px]" onClick={() => setPicker(field)}>
        选择
      </GhostButton>
    </Row>
  )

  /* ── 各页内容 ── */
  const pages: Record<PageKey, React.ReactNode> = {
    general: (
      <>
        <PageHead cn="通用" en="General" note="应用偏好" />
        <Row title="视觉主题" desc="海天 OS(深色)。锁版视觉面,主题切换未开放。">
          <Dot text="海天" tone="mut" />
        </Row>
        <Row title="板块背景" desc="粒子海=与开机同款粒子海(默认,衔接开场);静止=粒子海不动(久看不累/减动效);网点=旧 fbm 底。即时生效。">
          <BgToggle />
        </Row>
        <Row title="开机动画" desc="启动时的海平线开场。已看过则自动跳过,可在开场时按 Esc 直达。">
          <Dot text="智能跳过" tone="ok" />
        </Row>
        <Row title="数据目录" desc="索引、设置和日志的存储位置(%LOCALAPPDATA%\ROM-AI)。非必要切勿修改。" />
      </>
    ),
    hotkeys: (
      <>
        <PageHead cn="快捷键" en="Hotkeys" note="全键盘操作" />
        <Sect>全局</Sect>
        <Row title="全局检索" desc="任何板块唤起检索浮层。">
          <Kbd k="Ctrl" />
          <Kbd k="K" />
        </Row>
        <Row title="切换板块" desc="五大板块直达。">
          <Kbd k="1" />
          <span className="font-skcjk text-[10px] text-sk-muted2">…</span>
          <Kbd k="5" />
        </Row>
        <Sect>检索浮层</Sect>
        <Row title="执行检索" desc="输入框内回车。">
          <Kbd k="Enter" />
        </Row>
        <Row title="关闭浮层" desc="检索/设置浮层通用。">
          <Kbd k="Esc" />
        </Row>
        <Sect>开场</Sect>
        <Row title="暂停 / 跳过开机动画" desc="影片阶段可用。">
          <Kbd k="Space" />
          <Kbd k="Esc" />
        </Row>
      </>
    ),
    privacy: (
      <>
        <PageHead cn="数据隐私" en="Privacy" note="哪些数据会离开这台机器 · 如实分级" />
        <div className="mt-3.5 rounded-[12px] border-[0.5px] border-sk-hair bg-[rgba(242,241,238,.02)] px-4.5 py-3.5 px-[18px]">
          <div className="mb-1.5 font-skcjk text-[12.5px] font-normal tracking-[0.08em] text-sk-fg">我们不做的事</div>
          {[
            '永不公网——检索、文档、未来的对外接口全部只在本机(投标资料涉密纪律)',
            '不采集遥测,不上报任何使用数据',
            '不做强制账号,全部能力本机可用',
            '密钥仅写入不回显',
          ].map((t) => (
            <div key={t} className="flex gap-2 py-[5px] font-skcjk text-[11.5px] font-light text-sk-muted">
              <span className="text-sk-ok">✓</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex gap-2.5">
          <div className="flex-1 rounded-[12px] border-[0.5px] border-sk-hair bg-[rgba(242,241,238,.02)] px-4 py-3">
            <Dot text="本机" tone="ok" />
            <div className="mt-2 font-skcjk text-[10.5px] font-light leading-[1.6] text-sk-muted2">
              任务在本地完成,数据不离开这台机器。
              <br />
              文档原文 / 全文索引 / OCR / 库体检
            </div>
          </div>
          <div className="flex-1 rounded-[12px] border-[0.5px] border-sk-hair bg-[rgba(242,241,238,.02)] px-4 py-3">
            <Dot text="第三方(仅AI调用)" tone="warn" />
            <div className="mt-2 font-skcjk text-[10.5px] font-light leading-[1.6] text-sk-muted2">
              仅发送该任务所需文本。
              <br />
              AI 研判·DeepSeek / 生图·APImart / 腾讯会议
            </div>
          </div>
          <div className="flex-1 rounded-[12px] border-[0.5px] border-[rgba(207,127,127,.35)] bg-[rgba(242,241,238,.02)] px-4 py-3">
            <Dot text="公网" tone="risk" />
            <div className="mt-2 font-skcjk text-[10.5px] font-light leading-[1.6] text-sk-muted2">
              0 项 · 永久禁止。
              <br />
              无隧道、无远程访问——设计决定,非待开发。
            </div>
          </div>
        </div>
        <Sect>逐项分级</Sect>
        <Row title="文档原文" desc="存储在本机知识仓库,永不上传。">
          <Dot text="本机" tone="ok" />
        </Row>
        <Row title="全文索引" desc="FTS5 本机索引,检索时不联网。">
          <Dot text="本机" tone="ok" />
        </Row>
        <Row title="AI 研判 / 纪要 / 技能" desc="调用 DeepSeek,仅发送该任务所需文本;停用 Key 即完全本地。">
          <Dot text="第三方" tone="warn" />
        </Row>
        <Row title="生图" desc="APImart,仅发送提示词与参考图。">
          <Dot text="第三方" tone="warn" />
        </Row>
        <Row title="远程 / 公网访问" desc="无隧道、无远程访问能力。这是设计决定,不是待开发项。">
          <Dot text="禁止" tone="risk" />
        </Row>
      </>
    ),
    about: (
      <>
        <PageHead cn="关于" en="About" note="应用信息" />
        <Row title="版本" desc="ROM-AI 内测版。">
          <span className="font-sans text-[11px] text-sk-muted">internal-0.2+</span>
        </Row>
        <Row title="数据目录" desc="索引、设置和日志的存储位置。exe 形态在 %LOCALAPPDATA%\ROM-AI。" />
        <Row title="设计语言" desc="海天 OS——海平线、深水层、细字重。锁版视觉面。" />
      </>
    ),
    paths: (
      <>
        <PageHead cn="资料路径" en="Paths" note="三条路径各司其职 · 不可混填" />
        {pathRow('知识仓库', '整理入库的资料复制到这里,按项目归档。检索与打开位置都指向此根。', 'repo')}
        {pathRow('工作目录', '「一键清理」作用的设计工作目录——只扫描整理,不迁移文件。', 'ws')}
        {pathRow('收件箱', '同事丢文件的中转文件夹。点「立即扫描」把新文件收进知识仓库,留空=停用。', 'inbox')}
        <div className="flex items-center gap-3 pt-3">
          <GhostButton pri onClick={() => void save()}>
            {busy ? '保存中…' : '保存'}
          </GhostButton>
          {msg && <span className="font-skcjk text-[11.5px] font-light text-sk-ok">{msg}</span>}
          {err && <span className="font-skcjk text-[11.5px] font-light text-sk-risk">{err}</span>}
        </div>
      </>
    ),
    projects: (
      <>
        <PageHead cn="项目库" en="Projects" note={`${projList.length} 个项目`} />
        {projList.length === 0 && (
          <div className="py-3 font-skcjk text-[12px] font-light text-sk-muted">暂无项目。入库资料时按来源文件夹自动建项。</div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {projList.map((p) => (
            <div key={p.id} className="rounded-[12px] border-[0.5px] border-sk-hair bg-[rgba(242,241,238,.02)] px-4 py-3">
              <div className="truncate font-skcjk text-[13px] font-normal tracking-[0.04em] text-sk-fg">{p.name}</div>
              <div className="mt-1 font-skcjk text-[10.5px] font-light tracking-[0.06em] text-sk-muted2">
                {p.city || '—'} · {p.client || '—'}
              </div>
            </div>
          ))}
        </div>
      </>
    ),
    index: (
      <>
        <PageHead cn="索引" en="Index" note="库的真实状态 · 只读" />
        <div className="mt-4">
          <span className="font-sans text-[34px] font-medium text-sk-fg [font-variant-numeric:tabular-nums]">
            {stats ? stats.documents : '…'}
          </span>
          <span className="ml-2 font-skcjk text-[12px] font-light text-sk-muted2">
            个文档{stats && stats.indexed >= stats.documents ? ' · 全部已入全文索引' : stats ? ` · 已索引 ${stats.indexed}` : ''}
          </span>
        </div>
        {typeStats.length > 0 && (
          <>
            <div className="mt-2.5 flex h-[6px] overflow-hidden rounded-full">
              {typeStats.map(([t, n], i) => (
                <i key={t} style={{ flex: n, background: ['#7fb3cf', '#a8cfe0', '#4f7f9e', '#d7e5ec', 'rgba(161,165,170,.35)'][i % 5] }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-skcjk text-[10px] font-light text-sk-muted2">
              {typeStats.map(([t, n], i) => (
                <span key={t}>
                  <i
                    className="mr-1 inline-block h-[6px] w-[6px] rounded-[2px]"
                    style={{ background: ['#7fb3cf', '#a8cfe0', '#4f7f9e', '#d7e5ec', 'rgba(161,165,170,.5)'][i % 5] }}
                  />
                  {t} {n}
                </span>
              ))}
            </div>
          </>
        )}
        <Sect>检索能力</Sect>
        <Row title="全文检索" desc="FTS5 全文索引+中文分词。异常时自动降级为基础匹配,不中断检索。">
          {health?.checks ? <Dot text={health.checks.fts ? '运行中' : '已降级'} tone={health.checks.fts ? 'ok' : 'warn'} /> : <Dot text="…" tone="mut" />}
        </Row>
        <Row title="图片文字识别" desc="扫描件与图片的 OCR(RapidOCR,本机推理,不联网)。">
          {health?.checks ? <Dot text={health.checks.ocr ? '已就绪 ✓' : '未安装'} tone={health.checks.ocr ? 'ok' : 'mut'} /> : <Dot text="…" tone="mut" />}
        </Row>
        <Row title="语义检索" desc="按含义找资料(同义词/跨语言)。未接入——列在路线图 P4,不占资源。">
          <Dot text="未接入" tone="mut" />
        </Row>
        <Sect>库健康</Sect>
        <Row
          title="文件完整性"
          desc={
            health
              ? `最近体检:${health.counts.missing} 丢失 · ${health.counts.detached} 根脱节 · ${health.counts.orphan} 孤儿。四态体检按需运行。`
              : '四态体检(在位/丢失/孤儿/根脱节)按需运行。'
          }
        >
          {health &&
            (health.counts.missing + health.counts.detached > 0 ? (
              <Dot text={`${health.counts.missing + health.counts.detached} 异常`} tone="risk" />
            ) : health.counts.orphan > 0 ? (
              <Dot text={`${health.counts.orphan} 孤儿`} tone="warn" />
            ) : (
              <Dot text="全部在位 ✓" tone="ok" />
            ))}
          <GhostButton className="px-3 py-[5px]" onClick={() => void runHealth()}>
            {healthBusy ? '体检中…' : '库健康体检'}
          </GhostButton>
        </Row>
        <Row title="最后入库" desc="最近一次资料进入知识仓库的时间。">
          <span className="font-skcjk text-[11px] font-light text-sk-muted">
            {health?.checks?.last_indexed_at ? health.checks.last_indexed_at.slice(0, 16).replace('T', ' ') : '—'}
          </span>
        </Row>
      </>
    ),
    ai: (
      <>
        <PageHead cn="AI 引擎" en="AI Engine" note="生成引擎与本地智能能力" />
        <Sect>生成引擎</Sect>
        <div className="flex items-center gap-3 rounded-[12px] border-[0.5px] border-sk-hair bg-[rgba(242,241,238,.02)] px-4 py-3">
          <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] border-[0.5px] border-[rgba(127,179,207,.4)] font-sans text-[11px] font-medium text-sk-primary">
            DS
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="font-skcjk text-[13px] font-normal text-sk-fg">DeepSeek</span>
            <Dot text={keySet ? '就绪' : '未配置'} tone={keySet ? 'ok' : 'mut'} />
            <span className="rounded-full border-[0.5px] border-sk-hairsoft px-2 py-[1px] font-skcjk text-[9.5px] font-light text-sk-muted2">
              1 模型
            </span>
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <input
            className="min-w-0 flex-1 border-0 border-b border-sk-hair bg-transparent pb-1 font-skcjk text-[12px] font-light text-sk-fg outline-none placeholder:text-sk-muted2 focus:border-sk-primary"
            type="password"
            placeholder={keySet ? '已配置(留空不改;输入新值覆盖)' : '未配置 · 粘贴 API Key'}
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          />
          <GhostButton pri className="flex-none px-3.5 py-[5px]" onClick={() => void save()}>
            {busy ? '…' : '保存'}
          </GhostButton>
        </div>
        {msg && <div className="mt-1.5 font-skcjk text-[11px] font-light text-sk-ok">{msg}</div>}
        {err && <div className="mt-1.5 font-skcjk text-[11px] font-light text-sk-risk">{err}</div>}
        <div className="mt-1.5 font-skcjk text-[10.5px] font-light leading-[1.6] text-sk-muted2">
          {keySet
            ? '已就绪:会议纪要五段式生成、PPT 大纲、AI 研判即可用。'
            : '用于会议纪要五段式生成、PPT 大纲、AI 研判。未配置时转写稿仍可查看/导出,只是不生成纪要。填入并保存后立即可用,无需重启。'}
        </div>
        <Row title="回复语言" desc="固定 AI 回复与纪要的语言;「跟随用户」时按你的消息判断。中英混合汇报场景用。" plan>
          <Dot text="跟随用户" tone="mut" />
        </Row>
        <Sect>本地能力</Sect>
        <Row title="本地 OCR" desc="扫描件与图片的文字识别(RapidOCR,本机推理,不联网)。">
          {health?.checks ? <Dot text={health.checks.ocr ? '已就绪 ✓' : '未安装'} tone={health.checks.ocr ? 'ok' : 'mut'} /> : <Dot text="…" tone="mut" />}
        </Row>
        <Row title="全文检索引擎" desc="FTS5 全文索引。异常时检索自动降级为基础匹配。">
          {health?.checks ? <Dot text={health.checks.fts ? '运行中' : '已降级'} tone={health.checks.fts ? 'ok' : 'warn'} /> : <Dot text="…" tone="mut" />}
        </Row>
        <Row title="语义检索" desc="按含义找资料(同义词/跨语言)。未接入——列在路线图 P4,不占资源。">
          <Dot text="未接入" tone="mut" />
        </Row>
      </>
    ),
    search: (
      <>
        <PageHead cn="检索" en="Search" note="怎么找资料" />
        <Row title="全局检索" desc="Ctrl+K 任意板块唤起;「@项目名 关键词」限定单项目,重名弹选不猜。">
          <Kbd k="Ctrl" />
          <Kbd k="K" />
        </Row>
        <Row title="板内检索" desc="数据基地首页检索行,与全局检索共用同一通路——结果永远一致。" />
        <Row title="打开所在位置" desc="命中卡直接在资源管理器定位文件;文件缺失时如实提示并指向库健康体检。" />
        <Row title="检索历史" desc="最近检索词与最近项目(仅本机 localStorage,不上传)。" plan>
          <Dot text="规划 P1-5" tone="mut" />
        </Row>
      </>
    ),
    integrations: (
      <>
        <PageHead cn="集成" en="Integrations" note="对外供给 · 规划中" />
        <Row title="MCP 服务" desc="让 Claude Desktop 等 AI 工具检索本机项目资料。仅本机,永不公网。路线图 P5。" plan>
          <Dot text="规划 P5" tone="mut" />
        </Row>
        <Row title="腾讯会议" desc="项目中心一键建会已接入(真实外呼)。">
          <Dot text="已接入" tone="ok" />
        </Row>
      </>
    ),
  }

  return (
    <div
      className="absolute inset-0 z-skoverlay flex items-center justify-center bg-[rgba(6,8,10,.55)] backdrop-blur-[6px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[min(640px,88%)] w-[min(1020px,95%)] flex-col rounded-skcomposer border-[0.5px] border-sk-border bg-[rgba(10,12,14,.94)] p-6 px-7">
        {/* 头 */}
        <div className="flex flex-none items-baseline gap-3 pb-2">
          <span className="font-skcjk text-[15px] font-normal tracking-[0.18em] text-sk-fg">设 置</span>
          <span className="font-sans text-[9px] font-light uppercase tracking-[0.26em] text-sk-muted2">Settings</span>
          <span className="ml-auto font-skcjk text-[10.5px] font-light tracking-[0.1em] text-sk-muted2">密钥仅写入 · 不回显</span>
          <GhostButton className="px-3.5 py-[5px]" onClick={onClose}>
            关闭
          </GhostButton>
        </div>
        {/* 两栏 */}
        <div className="flex min-h-0 flex-1 pt-1.5">
          <nav className="flex w-[172px] flex-none flex-col gap-0.5 border-r-[0.5px] border-sk-hairsoft py-1 pr-3">
            {NAV.map((sec) => (
              <div key={sec.section} className="mb-2">
                <div className="mb-1 px-3.5 font-sans text-[8.5px] font-medium uppercase tracking-[0.26em] text-sk-muted2">
                  {sec.section}
                </div>
                {sec.items.map((it) => (
                  <button
                    key={it.key}
                    className={`block w-full cursor-pointer rounded-[10px] border-0 px-3.5 py-2 text-left font-skcjk text-[12.5px] tracking-[0.06em] ${
                      page === it.key
                        ? 'bg-[rgba(127,179,207,.14)] font-normal text-sk-fg'
                        : 'bg-transparent font-light text-sk-muted hover:text-sk-fg'
                    }`}
                    onClick={() => setPage(it.key)}
                  >
                    {it.label}
                    {it.plan && <span className="ml-1.5 font-skcjk text-[8.5px] tracking-[0.15em] text-sk-muted2">规划</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <main className="sk-scroll min-w-0 flex-1 overflow-y-auto py-1 pl-6">
            {/* B④ 读取失败横幅(错误≠空值,失败源如实点名 + 一键重试;不再让"…"永挂) */}
            {readErr && (
              <div className="mb-3 flex items-center gap-3 rounded-[10px] border-[0.5px] border-[rgba(207,127,127,.32)] bg-[rgba(207,127,127,.06)] px-3.5 py-2.5">
                <span className="font-skcjk text-[11.5px] font-light text-sk-risk">{readErr}</span>
                <GhostButton className="ml-auto px-3 py-1 text-[10.5px]" onClick={() => setReadVer((v) => v + 1)}>
                  重试 ↻
                </GhostButton>
              </div>
            )}
            {pages[page]}
          </main>
        </div>
      </div>

      {/* 三路径选文件夹(dev 降级;exe 走 pywebview 原生桥)。选中回填对应字段,不混填。 */}
      <FolderPicker
        open={picker != null}
        foldersOnly
        initialPath={picker === 'repo' ? draft.repo : picker === 'ws' ? draft.ws : draft.inbox}
        onPick={(p) => {
          setDraft((d) => ({
            ...d,
            repo: picker === 'repo' ? p : d.repo,
            ws: picker === 'ws' ? p : d.ws,
            inbox: picker === 'inbox' ? p : d.inbox,
          }))
          setPicker(null)
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  )
}

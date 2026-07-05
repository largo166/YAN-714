import { boardImages } from '../../data/boardImages'
import { AI_STAFF, CLIENT_PROFILES, TEAM_MEMBERS } from '../../data/projects.mock'
import { CardHead, GlassCard, HeadNote } from '../common/GlassCard'
import { Dot, GhostButton, Label, Pill } from '../common/PillButton'
import { StatBlock } from '../common/StatBlock'

/* ═══ b3 协作平台:横幅+三列——团队空间做主角,通知叠印 ═══ */

export function HubBoard() {
  const img = boardImages.hub
  return (
    <div className="absolute inset-0 flex flex-col gap-4 p-[22px] px-11 pb-5">
      {/* 横幅主角 */}
      <figure className="relative m-0 h-[47%] flex-none overflow-hidden rounded-skpanel border-[0.5px] border-sk-border" data-in>
        {img && <img src={img.src} alt="团队空间" className="absolute inset-0 h-full w-full object-cover [filter:saturate(.9)]" />}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(10,12,14,.82) 8%, rgba(10,12,14,.4) 46%, rgba(10,12,14,.12))' }}
        />
        <div className="absolute bottom-6 left-[30px] z-[2] flex max-w-[60%] flex-col gap-3">
          <Label>Hub{'　'}团队协同</Label>
          <div className="font-skcjk text-[31px] font-light tracking-[0.14em] [text-indent:0.14em] text-sk-fg">
            谁在做什么<span className="sk-accent-text">{'　'}一眼可见</span>
          </div>
          <div className="flex items-center gap-[9px] font-skcjk text-[12px] font-light tracking-[0.08em] text-[#cfd4d8]">
            <Dot tone="ok" glow />
            今天下午 2 点开会 · 驾驶舱发布的全员通知在此轮播
          </div>
        </div>
        <div className="absolute bottom-[22px] right-[26px] z-[2] flex gap-[34px]">
          <StatBlock value="4" label="团队成员" compact />
          <StatBlock value="2" label="智能助手在岗" tone="pri" compact />
          <StatBlock value="3" label="甲方画像" compact />
        </div>
      </figure>

      {/* 三列 */}
      <div className="flex min-h-0 flex-1 gap-4" data-in>
        <GlassCard className="flex-1">
          <CardHead
            title="团队成员"
            en="Team"
            right={<GhostButton className="px-3.5 py-[5px]">+ 添加成员</GhostButton>}
          />
          <div>
            {TEAM_MEMBERS.map((m) => (
              <MemberRow key={m.name} g={m.g} name={m.name} role={m.role} right={<Pill tone={m.pill as 'warn' | 'ok'}>{m.pillTxt}</Pill>} />
            ))}
          </div>
        </GlassCard>
        <GlassCard className="flex-1">
          <CardHead title="甲方画像库" en="Clients" />
          <div className="mt-0.5 flex flex-wrap gap-2">
            {CLIENT_PROFILES.map((c) => (
              <button
                key={c}
                className="cursor-pointer rounded-full border-[0.5px] border-sk-hairsoft bg-transparent px-[15px] py-1.5 font-skcjk text-[12px] font-light tracking-[0.1em] text-sk-muted transition-all duration-200 hover:border-[rgba(127,179,207,.4)] hover:text-sk-primary"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="font-skcjk text-[12.5px] font-light leading-[2.05] tracking-[0.03em] text-sk-muted">
            同一甲方的项目 / 诉求 / 历史{'　'}一处聚合{'　'}点开即读其审美偏好与决策习惯
          </div>
        </GlassCard>
        <GlassCard className="flex-1">
          <CardHead title="智能助手" en="AI Staff" right={<HeadNote>分阶段上岗</HeadNote>} />
          <div>
            {AI_STAFF.map((m) => (
              <MemberRow
                key={m.name}
                g={m.g}
                name={m.name}
                role={m.role}
                dimAvatar={!m.on}
                dimName={!m.on}
                right={m.on ? <Pill tone="ok">可用</Pill> : undefined}
              />
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

function MemberRow({
  g,
  name,
  role,
  right,
  dimAvatar,
  dimName,
}: {
  g: string
  name: string
  role: string
  right?: React.ReactNode
  dimAvatar?: boolean
  dimName?: boolean
}) {
  return (
    <div className="flex items-center gap-[13px] border-b-[0.5px] border-sk-hairsoft py-[9px] last:border-b-0">
      <div
        className="grid h-[34px] w-[34px] flex-none place-items-center rounded-sktile border-[0.5px] border-[rgba(127,179,207,.4)] font-skcjk text-[13px] font-normal text-sk-primary"
        style={dimAvatar ? { opacity: 0.45 } : undefined}
      >
        {g}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`font-skcjk text-[13.5px] font-normal tracking-[0.06em] ${dimName ? 'text-sk-muted' : 'text-sk-fg'}`}>{name}</div>
        <div className="mt-0.5 font-skcjk text-[11px] font-light tracking-[0.05em] text-sk-muted2">{role}</div>
      </div>
      {right}
    </div>
  )
}

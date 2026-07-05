import type { KnowledgeHit, ProjectCognition } from '@/types/schemas'

/* b2 · MoA 设计委员会结构化成果 + 特殊三件套(caselib/condition/slang)真端点渲染,海天 token 版。
   数据契约与紫黑 MoaDark/SpecialView 相同(output_json.checklist / hits / cognition / slang)。 */

export type SlangItem = { term: string; meaning: string; impact: string; action: string }
export type Special =
  | { type: 'knowledge'; hits: KnowledgeHit[] }
  | { type: 'cognition'; items: ProjectCognition[] }
  | { type: 'slang'; items: SlangItem[] }

export function MoaView({ cl }: { cl: Record<string, unknown> }) {
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)
  const score = num(cl.overall_score)
  const pass = num(cl.pass_rate)
  const risk = String(cl.risk_level || '—')
  const riskColor = risk === 'high' ? 'var(--sk-risk)' : risk === 'medium' ? 'var(--sk-warn)' : risk === 'low' ? 'var(--sk-ok)' : 'var(--sk-muted)'
  const arr = (k: string) => (Array.isArray(cl[k]) ? (cl[k] as Record<string, unknown>[]) : [])
  const cats = arr('categories')
  const conflicts = arr('cross_cutting_issues').length ? arr('cross_cutting_issues') : arr('conflict_items')
  const highlights = arr('highlights')
  const steps = Array.isArray(cl.next_steps) ? (cl.next_steps as string[]) : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-6">
        {([
          ['总分', score != null ? String(score) : '—', score == null ? 'var(--sk-muted)' : score >= 80 ? 'var(--sk-ok)' : score >= 60 ? 'var(--sk-warn)' : 'var(--sk-risk)'],
          ['风险', risk === 'high' ? '高' : risk === 'medium' ? '中' : risk === 'low' ? '低' : risk, riskColor],
          ['通过率', pass != null ? `${Math.round(pass * 100)}%` : '—', 'var(--sk-foreground)'],
        ] as const).map(([k, v, c]) => (
          <div key={k}>
            <div className="font-skcjk text-[10.5px] font-light tracking-[0.12em] text-sk-muted2">{k}</div>
            <div className="font-sans text-[21px] font-medium [font-variant-numeric:tabular-nums]" style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {typeof cl.one_sentence_review === 'string' && (
        <div className="border-l-2 border-sk-primary pl-2.5 font-skcjk text-[12.5px] font-normal text-sk-fg">{cl.one_sentence_review}</div>
      )}
      {highlights.length > 0 && (
        <div>
          <b className="font-skcjk text-[12px] font-normal text-sk-ok">✦ 设计亮点</b>
          {highlights.map((h, i) => (
            <div key={i} className="mt-1 text-[12px] text-[#c9ccd0]">
              <b className="font-normal text-sk-fg">{String(h.aspect || '')}</b>
              {h.note ? `:${String(h.note)}` : ''}
            </div>
          ))}
        </div>
      )}
      {cats.length > 0 && (
        <div>
          <b className="font-skcjk text-[12px] font-normal text-sk-fg">评图清单</b>
          {cats.map((cat, ci) => (
            <div key={ci} className="mt-2 rounded-[10px] border-[0.5px] border-sk-hairsoft bg-[rgba(242,241,238,.02)] p-2 px-2.5">
              <div className="font-skcjk text-[12px] font-normal text-sk-fg">{String(cat.label || cat.category || '')}</div>
              {(Array.isArray(cat.items) ? (cat.items as Record<string, unknown>[]) : []).map((it, ii) => (
                <div key={ii} className="mt-1.5 text-[11.5px] text-[#c9ccd0]">
                  <span
                    className="mr-1.5 rounded px-1.5 py-px text-[10px] text-[#0a0c0e]"
                    style={{ background: it.pass ? 'var(--sk-ok)' : 'var(--sk-risk)' }}
                  >
                    {it.pass ? '通过' : '不通过'}
                  </span>
                  <b className="font-normal text-sk-fg">{String(it.item || '')}</b>
                  {it.note ? `:${String(it.note)}` : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {conflicts.length > 0 && (
        <div>
          <b className="font-skcjk text-[12px] font-normal text-sk-warn">⚔ 跨维度问题</b>
          {conflicts.map((c, i) => (
            <div key={i} className="mt-1.5 rounded-[10px] border-[0.5px] border-[rgba(201,178,127,.3)] bg-[rgba(201,178,127,.05)] p-2 px-2.5 text-[11.5px] text-[#c9ccd0]">
              <div className="font-normal text-sk-fg">{String(c.issue || '')}</div>
              {c.resolution ? <div className="mt-0.5 text-sk-fg">↳ {String(c.resolution)}</div> : null}
            </div>
          ))}
        </div>
      )}
      {steps.length > 0 && (
        <div>
          <b className="font-skcjk text-[12px] font-normal text-sk-fg">下一步建议</b>
          {steps.map((s, i) => (
            <div key={i} className="mt-1 text-[12px] text-[#c9ccd0]">{i + 1}. {s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SpecialResultView({ s }: { s: Special }) {
  const box = 'mt-2 rounded-[10px] border-[0.5px] border-sk-hairsoft bg-[rgba(242,241,238,.02)] p-2.5 px-3'
  if (s.type === 'knowledge') {
    if (!s.hits.length) return <div className="text-sk-muted">知识库无命中。可先到数据基地补充/索引资料。</div>
    return (
      <>
        <div className="text-[12px] text-sk-muted2">知识库检索命中 {s.hits.length} 条:</div>
        {s.hits.map((h, i) => (
          <div key={i} className={box}>
            <div className="font-normal text-sk-fg">{h.title}{h.locator ? <span className="ml-1.5 text-[10.5px] font-light text-sk-muted2">· {h.locator}</span> : null}</div>
            {h.snippet && <div className="mt-1 text-[11.5px] text-[#c9ccd0]">{h.snippet}</div>}
          </div>
        ))}
      </>
    )
  }
  if (s.type === 'cognition') {
    const conf = s.items.filter((c) => c.summary_md || (c.fields && c.fields.length))
    if (!conf.length) return <div className="text-sk-muted">本项目暂无已抽取的结构化认知。可到项目中心做 AI 抽取。</div>
    return (
      <>
        <div className="text-[12px] text-sk-muted2">项目结构化认知 {conf.length} 个模块:</div>
        {conf.map((c) => (
          <div key={c.id} className={box}>
            <div className="font-normal text-sk-fg">
              {c.module_label || c.module}
              <span className={`ml-2 rounded-full border-[0.5px] border-sk-hairsoft px-1.5 text-[10px] ${c.module_status === 'confirmed' ? 'text-sk-ok' : 'text-sk-warn'}`}>
                {c.module_status === 'confirmed' ? '已确认' : '草案'}
              </span>
            </div>
            {c.summary_md && <div className="mt-1 text-[11.5px] text-[#c9ccd0]">{c.summary_md}</div>}
          </div>
        ))}
      </>
    )
  }
  if (!s.items.length) return <div className="text-sk-muted">词典无匹配条目。</div>
  return (
    <>
      <div className="text-[12px] text-sk-muted2">甲方黑话翻译 {s.items.length} 条:</div>
      {s.items.map((it, i) => (
        <div key={i} className={box}>
          <div className="font-normal text-sk-fg">「{it.term}」</div>
          <div className="mt-1 text-[11.5px] text-[#c9ccd0]">真实含义:{it.meaning}</div>
          {it.impact && <div className="text-[11.5px] text-sk-muted">设计影响:{it.impact}</div>}
          {it.action && <div className="text-[11.5px] text-sk-muted">建议动作:{it.action}</div>}
        </div>
      ))}
    </>
  )
}

import { useCallback, useEffect, useState } from 'react'

import {
  api,
  type MoaChecklist,
  type MoaReferenceDetail,
  type MoaReviewResult,
} from '@/lib/api'

const RISK: Record<string, { t: string; c: string }> = {
  low: { t: '低风险', c: 'var(--ok)' },
  medium: { t: '中风险', c: 'var(--terra)' },
  high: { t: '高风险', c: 'var(--red)' },
}
function riskInfo(level?: string) {
  return RISK[(level || '').toLowerCase()] || { t: level || '—', c: 'var(--mut)' }
}
function scoreColor(s?: number) {
  if (s == null) return 'var(--mut)'
  if (s >= 80) return 'var(--ok)'
  if (s >= 60) return 'var(--terra)'
  return 'var(--red)'
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ minWidth: 88 }}>
      <div style={{ fontSize: 11, color: 'var(--mut)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--ink)', lineHeight: 1.2 }}>
        {value}
        {sub && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--mut)' }}> {sub}</span>}
      </div>
    </div>
  )
}

/** MoA 评审结果渲染(总分/风险/通过率 + 六维度 + 冲突项 + 下一步 + 三专家原话 + 成本)。 */
function MoaResult({
  checklist,
  details,
  cost,
  createdAt,
  historyOnly,
}: {
  checklist: MoaChecklist
  details: MoaReferenceDetail[] | null
  cost: MoaReviewResult['cost'] | null
  createdAt: string | null
  historyOnly: boolean
}) {
  const [showExperts, setShowExperts] = useState(false)

  if (checklist.parse_error) {
    return (
      <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--mut)' }}>
        主审模型输出未能解析为结构化清单（不伪造）。原始片段：
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, background: 'var(--panel2)', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
          {(checklist.raw_output || '').slice(0, 600)}
        </pre>
      </div>
    )
  }

  const cats = checklist.categories || []
  const conflicts = checklist.conflict_items || []
  const steps = checklist.next_steps || []

  return (
    <div style={{ marginTop: 12 }}>
      {/* 顶部指标 */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Metric label="总分" value={checklist.overall_score != null ? String(checklist.overall_score) : '—'} sub="/100" color={scoreColor(checklist.overall_score)} />
        <Metric label="风险等级" value={riskInfo(checklist.risk_level).t} color={riskInfo(checklist.risk_level).c} />
        <Metric label="通过率" value={checklist.pass_rate != null ? `${Math.round(checklist.pass_rate * 100)}%` : '—'} />
        {cost && <Metric label="本次成本" value={`¥${cost.total_cost_yuan}`} sub="估算值" />}
        {cost && <Metric label="耗时" value={`${Math.round(cost.total_latency_ms / 1000)}s`} />}
      </div>
      {cost && (
        <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 4 }}>
          ⚠ 成本为按字符数粗略估算，非真实账单；准确金额以 DeepSeek 控制台为准。
        </div>
      )}

      {/* 六维度检查清单 */}
      {cats.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>检查清单（{cats.length} 维度）</b>
          {cats.map((cat) => (
            <div key={cat.category} style={{ marginTop: 8, border: '1px solid var(--line2)', borderRadius: 8, padding: '8px 10px', background: 'var(--panel2)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{cat.label}（{cat.items.length}）</div>
              {cat.items.map((it, i) => (
                <div key={i} style={{ marginTop: 5, fontSize: 12 }}>
                  <span
                    style={{
                      color: '#fff', background: it.pass ? 'var(--ok)' : 'var(--red)',
                      borderRadius: 4, padding: '1px 6px', fontSize: 10.5, marginRight: 6,
                    }}
                  >
                    {it.pass ? '通过' : '不通过'}
                  </span>
                  <b>{it.item}</b>
                  {it.note && <span style={{ color: 'var(--ink2)' }}>：{it.note}</span>}
                  {!it.pass && (it.design_impact || it.suggested_action) && (
                    <div style={{ color: 'var(--mut)', marginTop: 2, marginLeft: 4 }}>
                      {it.design_impact && <span>影响：{it.design_impact}　</span>}
                      {it.suggested_action && <span>建议：{it.suggested_action}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 冲突项(MoA 核心价值:跨维度矛盾) */}
      {conflicts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13, color: 'var(--terra)' }}>⚔ 冲突项（{conflicts.length}）</b>
          {conflicts.map((c, i) => (
            <div key={i} style={{ marginTop: 6, border: '1px solid var(--terra-line)', background: 'var(--terra-soft)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>
              <div style={{ fontWeight: 600 }}>{c.issue}</div>
              {c.function_view && <div style={{ marginTop: 3 }}>· 功能视角：{c.function_view}</div>}
              {c.cost_view && <div>· 成本视角：{c.cost_view}</div>}
              {c.resolution && <div style={{ marginTop: 3, color: 'var(--ink)' }}>↳ 平衡建议：{c.resolution}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 下一步 */}
      {steps.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>下一步建议</b>
          {steps.map((s, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 3 }}>{i + 1}. {s}</div>
          ))}
        </div>
      )}

      {/* 三专家原话(可审计;仅新会诊有,历史回查无) */}
      {details && details.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button className="anbtn" type="button" onClick={() => setShowExperts((v) => !v)}>
            {showExperts ? '收起三位专家原话 ▴' : `查看三位专家原话（${details.length}）▾`}
          </button>
          {showExperts && details.map((d, i) => (
            <div key={i} style={{ marginTop: 6, border: '1px solid var(--line2)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {d.status === 'success' ? '✅' : '❌'} {d.role}
                <span style={{ fontWeight: 400, color: 'var(--mut)' }}> · {d.model} · {d.latency_ms}ms · ¥{d.cost_yuan}</span>
              </div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, color: 'var(--ink2)', marginTop: 4, fontFamily: 'inherit' }}>
                {d.status === 'success' ? d.output : `分析失败：${d.output}`}
              </pre>
            </div>
          ))}
        </div>
      )}

      {historyOnly && (
        <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 10 }}>
          {createdAt ? `历史会诊 · ${new Date(createdAt).toLocaleString()}　` : ''}
          历史记录仅保留聚合结论；专家原话与成本未单独留存（后续接入会诊链路表后补全）。
        </div>
      )}
    </div>
  )
}

/** 专家会诊 · MoA 方案评审最小闭环:可点(触发) / 可看(结果) / 可回查(挂载读最新)。 */
export default function MoaReviewPanel({ projectId }: { projectId: number | null }) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [checklist, setChecklist] = useState<MoaChecklist | null>(null)
  const [details, setDetails] = useState<MoaReferenceDetail[] | null>(null)
  const [cost, setCost] = useState<MoaReviewResult['cost'] | null>(null)
  const [createdAt, setCreatedAt] = useState<string | null>(null)
  const [historyOnly, setHistoryOnly] = useState(false)
  const [err, setErr] = useState('')

  // 挂载/切项目:回查最新一次会诊(可回查)
  const loadLatest = useCallback(() => {
    if (projectId == null) {
      setPhase('idle')
      setChecklist(null)
      return
    }
    api
      .getMoaReview(projectId)
      .then((d) => {
        if (d.success && d.checklist) {
          setChecklist(d.checklist)
          setDetails(null)
          setCost(null)
          setCreatedAt(d.created_at || null)
          setHistoryOnly(true)
          setPhase('done')
        } else {
          setChecklist(null)
          setPhase('idle')
        }
      })
      .catch(() => setPhase('idle'))
  }, [projectId])
  useEffect(() => {
    setErr('')
    loadLatest()
  }, [loadLatest])

  const run = async () => {
    if (projectId == null) return
    setPhase('loading')
    setErr('')
    try {
      const r = await api.runMoaReview(projectId)
      setChecklist(r.checklist)
      setDetails(r.reference_details)
      setCost(r.cost)
      setCreatedAt(null)
      setHistoryOnly(false)
      setPhase('done')
    } catch (e) {
      setErr((e as Error).message)
      setPhase('error')
    }
  }

  return (
    <div className="card mt">
      <div className="ct" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span>
          专家会诊 · MoA 评审{' '}
          <span className="statpill live">功能 / 甲方 / 成本 三专家 + 主审</span>
        </span>
        <button className="btn" type="button" disabled={projectId == null || phase === 'loading'} onClick={run}>
          {phase === 'loading' ? '会诊中…' : checklist ? '重新会诊' : '开始专家会诊'}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 4 }}>
        功能 / 甲方 / 成本三位 AI 专家分别评审本项目认知，再由主审整合出检查清单与跨维度冲突项。单模型容易把多视角混在一起判断，会诊能把矛盾显式标出来。
      </div>

      {projectId == null && (
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>请先选择作用项目。</div>
      )}

      {phase === 'loading' && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--terra)', background: 'var(--terra-soft)', border: '1px solid var(--terra-line)', borderRadius: 8, padding: '8px 10px' }}>
          ⏳ 专家会诊进行中…（约 40–60 秒）。三位专家正分别分析，随后由主审整合输出，请勿离开本页。
        </div>
      )}

      {phase === 'error' && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--red)', background: 'var(--terra-soft)', border: '1px solid var(--terra-line)', borderRadius: 8, padding: '8px 10px' }}>
          会诊失败：{err || '未知错误'}（不展示假数据）
          <button className="anbtn" type="button" onClick={run} style={{ marginLeft: 10 }}>重试</button>
        </div>
      )}

      {phase === 'done' && checklist && (
        <MoaResult checklist={checklist} details={details} cost={cost} createdAt={createdAt} historyOnly={historyOnly} />
      )}
    </div>
  )
}

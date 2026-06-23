/** 管理驾驶舱：原 ROM-AI boss 板块。默认隐藏（管理员登录后才在顶栏出现）。
 *  当前管理员后端未接入，本页作为视觉占位保留，数据接口待接入。 */
export default function BossPage() {
  return (
    <>
      <div className="ptitle">
        <h1>管理驾驶舱</h1>
        <span className="role-tip">🔒 仅管理员可见</span>
        <span className="adm">跨项目 · 只读聚合</span>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ct">
          全员通知 <span className="statpill demo">待接入</span>
        </div>
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '6px 0' }}>
          全员广播需要管理员登录与 <code>/api/boss</code> 接口，新工程尚未接入。
        </div>
      </div>

      <div className="grid4">
        {['进行中项目', '临近交付', '高风险项', 'AI 使用 · 本周'].map((l) => (
          <div className="metric" key={l}>
            <div className="l">{l}</div>
            <div className="v">—</div>
            <div className="x">跨项目聚合 · 待接入</div>
          </div>
        ))}
      </div>

      <div className="card mt">
        <div className="ct">
          飞书项目看板 · 合同进度 <span className="statpill demo">待接入</span>
        </div>
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '6px 0' }}>
          原版含飞书同步看板、成员工作量、项目评论等只读聚合视图，接入管理后端后恢复。
        </div>
      </div>
    </>
  )
}

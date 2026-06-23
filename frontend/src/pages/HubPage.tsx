const MEMBERS = [
  { nm: '严硕', rl: '设计总监', duty: '项目统筹 · 设计把关 · 对外汇报' },
  { nm: '韩暄', rl: '建筑师', duty: '技术深化 · 图纸成套 · 规范校核' },
  { nm: '梁霏', rl: '项目经理', duty: '进度管控 · 甲方对接 · 资源协调' },
  { nm: '张跃', rl: '方案主创', duty: '方案设计 · 概念立面 · 多方案比选' },
  { nm: '王云花', rl: '户型主创', duty: '户型平面 · 配比经济性 · 标准化' },
]

const AGENTS = [
  { nm: '找图小雷达', rl: '参考图检索', badge: 'ok', bt: '可用', duty: '按指令网页端自动找参考图', out: '→ 知识库 · 生图素材' },
  { nm: '材料小帮手', rl: '材料建议', badge: 'ok', bt: '可用', duty: '看效果图给材料建议 + 材料商', out: '→ 材料清单 · 供应商' },
  { nm: '审图老法师', rl: '图纸审核', badge: 'plan', bt: '规划中 · 辅助', duty: '审核技术图纸,标出图面疑点', out: '辅助标疑点,不替代人工' },
  { nm: '翻模小王子', rl: '3D 翻模', badge: 'plan', bt: '规划中', duty: '对照施工图翻 SU / 犀牛 / Blender', out: '仅干净 DWG 体块挤出 · 半自动' },
]

/** 协作平台：原 ROM-AI 团队成员 + 智能助手卡。
 *  成员数据原为前端静态演示；新后端尚无团队接口，此处按原样静态展示并标注。 */
export default function HubPage() {
  return (
    <>
      <div className="ptitle">
        <h1>协作平台</h1>
      </div>

      <div className="hublabel">
        团队成员
        <span className="sub" style={{ marginLeft: 8 }}>
          （静态示例 · 团队接口待接入）
        </span>
        <span className="ln2"></span>
      </div>
      <div className="grid3" style={{ marginBottom: 26 }}>
        {MEMBERS.map((m) => (
          <div className="mem" key={m.nm}>
            <div className="top">
              <span className="av human"></span>
              <div>
                <div className="nm">{m.nm}</div>
                <div className="rl">{m.rl}</div>
              </div>
              <span className="kind human">真实成员</span>
            </div>
            <div className="duty">
              <b>工作分工</b>
              <span className="dv">{m.duty}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hublabel">
        智能助手
        <span className="sub">中后期 Agent · 能力分阶段交付</span>
        <span className="ln2"></span>
      </div>
      <div className="grid3">
        {AGENTS.map((a) => (
          <div className="mem" key={a.nm}>
            <div className="top">
              <span className="av agent"></span>
              <div>
                <div className="nm">{a.nm}</div>
                <div className="rl">{a.rl}</div>
              </div>
              <span className={'stbadge ' + a.badge}>{a.bt}</span>
            </div>
            <div className="duty">
              <b>负责</b>
              {a.duty}
            </div>
            <div className="duty">
              <b>输出</b>
              {a.out}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

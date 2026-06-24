import { useEffect, useState } from 'react'

import { api } from '@/lib/api'
import FolderPicker from '@/components/FolderPicker'

/** 受控开关（复刻原 .sw / .sw.on） */
function Switch({ on, onToggle }: { on: boolean; onToggle?: () => void }) {
  return (
    <div className={'sw' + (on ? ' on' : '')} onClick={onToggle} role="switch" aria-checked={on}>
      <i />
    </div>
  )
}

/** 单选胶囊组（复刻原 .setsel） */
function SegSelect({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange?: (v: string) => void
}) {
  return (
    <div className="setsel" style={{ margin: 0 }}>
      {options.map((o) => (
        <button key={o} className={o === value ? 'on' : ''} onClick={() => onChange?.(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}

/** 密钥输入（复刻原 .keyin + 👁） */
function KeyInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const [show, setShow] = useState(false)
  return (
    <span className="keyin">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      <span className="eye" onClick={() => setShow((s) => !s)}>
        👁
      </span>
    </span>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

/** 右侧滑出设置抽屉 —— 复刻旧 ROM-AI 9 组结构与文案。
 *  「AI 引擎与密钥」组的 DeepSeek key / 默认引擎 / Base / Model / 主题 接新后端 /api/settings；
 *  其余组保留原 UI（开关/路径/单选为本地态），数据接口待接入，文案标注。 */
export default function SettingsDrawer({ open, onClose }: Props) {
  // 接后端的真实设置
  const [deepseekKey, setDeepseekKey] = useState('')
  const [keySet, setKeySet] = useState(false)
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [model, setModel] = useState('deepseek-chat')
  const [theme, setTheme] = useState('暖白')
  const [mockMode, setMockMode] = useState(true)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // 受管资料库(仓库)根:真实接后端。空=未配置→一键整理回退程序内部目录。
  const [repoRoot, setRepoRoot] = useState('')
  const [repoMsg, setRepoMsg] = useState<string | null>(null)
  const [repoErr, setRepoErr] = useState<string | null>(null)
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)

  // 本地 UI 态（未接后端，仅保真交互）
  const [autoIndex, setAutoIndex] = useState(true)
  const [slangDict, setSlangDict] = useState(true)
  const [noSizeLimit, setNoSizeLimit] = useState(true)
  const [lang, setLang] = useState('中文')
  const [pptStyle, setPptStyle] = useState('侘寂暖白')
  const [defBoard, setDefBoard] = useState('项目中心')

  useEffect(() => {
    if (!open) return
    api
      .getSettings()
      .then((s) => {
        setKeySet(s.deepseek_api_key_set)
        setBaseUrl(s.deepseek_base_url)
        setModel(s.deepseek_model)
        setTheme(s.theme === 'dark' ? '深色' : '暖白')
        setRepoRoot(s.repository_root_path || '')
      })
      .catch((e: Error) => setErr(e.message))
  }, [open])

  /** 保存仓库根(由目录弹窗选定后回调,或解除时传空)。后端校验:存在/可写/非嵌套 uploads…。 */
  const saveRepository = async (path: string) => {
    setRepoMsg(null)
    setRepoErr(null)
    try {
      const saved = await api.updateSettings({ repository_root_path: path.trim() })
      setRepoRoot(saved.repository_root_path || '')
      setRepoMsg(saved.repository_configured ? '仓库已配置，之后「一键整理」将整理进此文件夹' : '已解除仓库，整理回退程序内部目录')
    } catch (e) {
      setRepoErr((e as Error).message) // 后端 400 文案(不存在/不可写/嵌套 uploads…)
    }
  }

  const save = async () => {
    setSaveMsg(null)
    setErr(null)
    try {
      const saved = await api.updateSettings({
        deepseek_api_key: deepseekKey || undefined,
        deepseek_base_url: baseUrl,
        deepseek_model: model,
        theme: theme === '深色' ? 'dark' : 'light',
      })
      setKeySet(saved.deepseek_api_key_set)
      setDeepseekKey('')
      setSaveMsg('已保存到本机（SQLite）')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <>
      <div className={'setmask' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'setdrawer' + (open ? ' show' : '')} aria-label="设置">
        <div className="sethead">
          <div className="sett">⚙ 设置</div>
          <button className="setx" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="setbody">
          {/* 诚实说明:哪些设置真落库,哪些是留接缝展示——消除"开了就生效"的误导 */}
          <div className="setnote" style={{ margin: '0 0 10px' }}>
            ⓘ 当前仅「AI 引擎与密钥」(DeepSeek Key / Base / 模型) 与「主题」会随下方「保存配置」写入后端；
            本页其余开关 / 路径 / 单选为<strong>留接缝展示项</strong>，尚未接后端、切换不持久化。标「待接入 / 未接入」者同此。
          </div>

          {/* 0 管理账号 */}
          <div className="setsec">
            <div className="setsech">管理账号</div>
            <div className="setsecd">普通员工无需登录；登录后才启用「管理驾驶舱」</div>
            <div className="pathin" style={{ marginTop: 0 }}>
              <input placeholder="管理账号" autoComplete="off" disabled />
            </div>
            <div className="keyin" style={{ marginTop: 8 }}>
              <input type="password" placeholder="管理密码" disabled />
              <span className="eye">👁</span>
            </div>
            <div className="setbtns">
              <button className="btn" disabled title="管理员后端待接入">
                登录管理后台
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 6 }}>
              管理员登录后端（/api/admin/login）待接入。
            </div>
          </div>

          {/* 1 AI 引擎与密钥（接新后端） */}
          <div className="setsec">
            <div className="setsech">AI 引擎与密钥</div>
            <div className="setsecd">接入对话、生图、转写的模型，选择默认引擎</div>
            <div className="setnote">
              🔒 密钥仅存本地（SQLite / .env），不写入源码、不提交 GitHub、不上传云。界面只掩码显示，后端不回吐明文。
            </div>
            <div className="setsub">对话 · 推理</div>
            <div className="engrow">
              <span className="en">DeepSeek</span>
              <span className={'badge ' + (keySet ? 'on2' : 'off2')}>{keySet ? '已配置' : '未接入'}</span>
              <KeyInput
                value={deepseekKey}
                onChange={setDeepseekKey}
                placeholder={keySet ? '已配置，留空保持不变' : '粘贴 DeepSeek API Key'}
              />
            </div>
            <div className="engrow">
              <span className="en">Kimi</span>
              <span className="badge off2">未接入</span>
              <span className="keyin">
                <input type="password" placeholder="粘贴 Kimi API Key" disabled />
                <span className="eye">👁</span>
              </span>
            </div>
            <div className="engrow">
              <span className="en">ChatGPT</span>
              <span className="badge off2">未接入</span>
              <span className="keyin">
                <input type="password" placeholder="粘贴 OpenAI API Key" disabled />
                <span className="eye">👁</span>
              </span>
            </div>
            <div className="engrow">
              <span className="en">Claude</span>
              <span className="badge off2">未接入</span>
              <span className="keyin">
                <input type="password" placeholder="粘贴 Anthropic API Key" disabled />
                <span className="eye">👁</span>
              </span>
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">Base URL</div>
              </div>
            </div>
            <div className="pathin" style={{ marginTop: 0 }}>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">模型名</div>
              </div>
            </div>
            <div className="pathin" style={{ marginTop: 0 }}>
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="setsub">生图</div>
            <div className="engrow">
              <span className="en">即梦</span>
              <span className="keyin">
                <input type="password" placeholder="即梦 / huashu Key" disabled />
                <span className="eye">👁</span>
              </span>
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">Mock 模式</div>
                <div className="d">未配密钥时走兜底，不调用真实模型</div>
              </div>
              <Switch on={mockMode} onToggle={() => setMockMode((v) => !v)} />
            </div>
            <div className="setbtns">
              <button className="btn" onClick={save}>
                保存配置
              </button>
              {saveMsg && <span style={{ fontSize: 12, color: 'var(--ok)', alignSelf: 'center' }}>{saveMsg}</span>}
              {err && <span style={{ fontSize: 12, color: 'var(--red)', alignSelf: 'center' }}>{err}</span>}
            </div>
          </div>

          {/* 2 知识库与数据 */}
          <div className="setsec">
            <div className="setsech">知识库与数据</div>
            <div className="setsecd">资料目录、索引与存储位置</div>
            {/* 受管资料库(仓库)根:真实接后端。配置后「一键整理」把文件整理进此文件夹(资源管理器可读) */}
            <div className="setrow">
              <div className="lbl">
                <div className="t">
                  受管资料库（仓库）
                  <span
                    className="chip"
                    style={{ marginLeft: 8, fontSize: 10, background: repoRoot ? 'var(--ok)' : 'var(--line2)', color: repoRoot ? '#fff' : 'var(--mut)' }}
                  >
                    {repoRoot ? '已配置' : '未配置'}
                  </span>
                </div>
                <div className="d" style={{ wordBreak: 'break-all' }}>
                  {repoRoot || '未配置时整理回退程序内部目录（backend/data/uploads）'}
                </div>
                {repoMsg && <div className="d" style={{ color: 'var(--ok)' }}>{repoMsg}</div>}
                {repoErr && <div className="d" style={{ color: 'var(--red)' }}>{repoErr}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn" onClick={() => setRepoPickerOpen(true)}>
                  {repoRoot ? '更改仓库' : '选择仓库文件夹'}
                </button>
                {repoRoot && (
                  <button className="anbtn" onClick={() => saveRepository('')} title="解除配置,整理回退程序内部目录">解除</button>
                )}
              </div>
            </div>
            <PathRow t="Obsidian Vault（引用模式）" placeholder="待配置" d="引用模式" />
            <PathRow t="数据库 / 索引" placeholder="后端默认 backend/data/rom_ai.db" d="SQLite" />
            <div className="setrow">
              <div className="lbl">
                <div className="t">自动重建索引</div>
                <div className="d">FTS5 / BM25 · CJK 二元分词</div>
              </div>
              <Switch on={autoIndex} onToggle={() => setAutoIndex((v) => !v)} />
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">甲方黑话词典</div>
                <div className="d">内置资产 · 参与检索与诉求转译</div>
              </div>
              <Switch on={slangDict} onToggle={() => setSlangDict((v) => !v)} />
            </div>
          </div>

          {/* 3 上传与文件 */}
          <div className="setsec">
            <div className="setsech">上传与文件</div>
            <div className="setsecd">大文件流式落盘，避免卡死/崩溃</div>
            <PathRow t="上传落盘目录" placeholder="后端默认 backend/uploads" />
            <div className="setrow">
              <div className="lbl">
                <div className="t">不限制文件大小</div>
                <div className="d">分块流式写盘 · 内存恒定</div>
              </div>
              <Switch on={noSizeLimit} onToggle={() => setNoSizeLimit((v) => !v)} />
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">支持类型</div>
                <div className="d">PPTX · PDF（旧版 .ppt 需先转 .pptx）</div>
              </div>
            </div>
          </div>

          {/* 4 项目与角色 */}
          <div className="setsec">
            <div className="setsech">项目与角色</div>
            <div className="setsecd">默认项目、阶段模板、角色默认分工</div>
            <div className="setsub">角色 → 默认工作分工</div>
            {[
              ['设计总监', '项目统筹 · 设计把关 · 对外汇报'],
              ['方案主创', '方案设计 · 概念立面 · 多方案比选'],
              ['户型主创', '户型平面 · 配比经济性 · 标准化'],
            ].map(([r, d]) => (
              <div className="setrow" key={r}>
                <div className="lbl">
                  <div className="t">{r}</div>
                </div>
                <div className="d" style={{ fontSize: 11, color: 'var(--mut)' }}>
                  {d}
                </div>
              </div>
            ))}
          </div>

          {/* 5 数字员工与技能 */}
          <div className="setsec">
            <div className="setsech">数字员工与技能</div>
            <div className="setsecd">启用/停用后台 Agent 与技能</div>
            <ToggleRow t="找图小雷达" d="参考图检索" def />
            <ToggleRow t="材料小帮手" d="材料建议" def />
            <ToggleRow t="审图老法师" d="规划中 · 辅助标疑点" />
            <ToggleRow t="翻模小王子" d="规划中 · DWG 体块挤出" />
          </div>

          {/* 6 外观与语言 */}
          <div className="setsec">
            <div className="setsech">外观与语言</div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">主题</div>
                <div className="d">将随「保存配置」写入后端</div>
              </div>
              <SegSelect options={['暖白', '深色']} value={theme} onChange={setTheme} />
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">语言</div>
              </div>
              <SegSelect options={['中文', 'EN']} value={lang} onChange={setLang} />
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">汇报 PPT 风格</div>
                <div className="d">BIG / 扎哈 / 侘寂 · Anthropic 配色</div>
              </div>
              <SegSelect options={['侘寂暖白', '极简黑']} value={pptStyle} onChange={setPptStyle} />
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">默认进入板块</div>
              </div>
              <SegSelect options={['项目中心', 'AI 代理']} value={defBoard} onChange={setDefBoard} />
            </div>
          </div>

          {/* 7 成果发送渠道 */}
          <div className="setsec">
            <div className="setsech">成果发送渠道</div>
            <div className="setsecd">
              把生成的成果发到邮箱 / 企业微信。个人微信无官方接口，走二维码转发。发送后端待接入。
            </div>
            <div className="setsub">邮箱 · SMTP</div>
            <ToggleRow t="启用邮箱发送" />
            <div className="setsub">企业微信 · 群机器人</div>
            <ToggleRow t="启用企业微信发送" />
            <div className="setrow">
              <div className="lbl">
                <div className="t">个人微信</div>
                <div className="d">无官方发送接口 · 仅二维码转发</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--mut)' }}>二维码兜底</span>
            </div>
          </div>

          {/* 8 隐私 · 同步 · 安全 */}
          <div className="setsec">
            <div className="setsech">隐私 · 同步 · 安全</div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">本地运行</div>
                <div className="d">数据不出本机</div>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok)' }}>
                <span className="statusdot"></span>已启用
              </span>
            </div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">云同步备份</div>
                <div className="d">内主外备 · 本轮 OFF 范围</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--mut)' }}>未接入</span>
            </div>
            <div className="setbtns">
              <button className="btn ghost" disabled>
                ⤓ 导出全部数据
              </button>
              <button className="btn ghost" disabled>
                清空本地数据
              </button>
            </div>
          </div>

          {/* 9 关于与系统 */}
          <div className="setsec">
            <div className="setsech">关于与系统</div>
            <div className="aboutrow">
              <b>版本</b>
              <span className="mono" style={{ fontSize: 11, color: 'var(--mut)' }}>
                v0.1.0（重开发）
              </span>
            </div>
            <div className="aboutrow">
              <b>后端服务</b>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ok)' }}>
                <span className="statusdot"></span>127.0.0.1:8000
              </span>
            </div>
            <div className="aboutrow">
              <b>架构</b>
              <span className="mono" style={{ fontSize: 11, color: 'var(--mut)' }}>
                Track A · React + FastAPI + SQLite
              </span>
            </div>
          </div>
        </div>
      </aside>

      <FolderPicker
        open={repoPickerOpen}
        foldersOnly
        initialPath={repoRoot}
        onPick={(p) => { setRepoPickerOpen(false); saveRepository(p) }}
        onClose={() => setRepoPickerOpen(false)}
      />
    </>
  )

  function ToggleRow({ t, d, def = false }: { t: string; d?: string; def?: boolean }) {
    const [on, setOn] = useState(def)
    return (
      <div className="setrow">
        <div className="lbl">
          <div className="t">{t}</div>
          {d && <div className="d">{d}</div>}
        </div>
        <Switch on={on} onToggle={() => setOn((v) => !v)} />
      </div>
    )
  }
}

function PathRow({ t, placeholder, d }: { t: string; placeholder: string; d?: string }) {
  return (
    <>
      <div className="setrow" style={{ border: 0, paddingBottom: 4 }}>
        <div className="lbl">
          <div className="t">{t}</div>
          {d && <div className="d">{d}</div>}
        </div>
      </div>
      <div className="pathin" style={{ marginTop: 0 }}>
        <input value="" placeholder={placeholder} readOnly />
        <span className="br">更改</span>
      </div>
    </>
  )
}

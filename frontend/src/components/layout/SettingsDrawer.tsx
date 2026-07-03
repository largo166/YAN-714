import { useEffect, useState } from 'react'
import { Eye, EyeOff, Lock, Settings } from 'lucide-react'

import { api } from '@/lib/api'
import FolderPicker from '@/components/FolderPicker'

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
      <span className="eye" onClick={() => setShow((s) => !s)} style={{ display: 'inline-flex' }}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </span>
    </span>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

/** 右侧滑出设置抽屉（2026-07 收纳版）。
 *  明面只放【真实生效】的设置:AI 引擎(DeepSeek)/受管仓库/主题/关于;
 *  一切未接后端的开关、路径、渠道统一收进底部「即将接入」折叠区——
 *  不再一排灰控件糊脸,也不再出现"留接缝展示项"这类工程口径。 */
export default function SettingsDrawer({ open, onClose }: Props) {
  // 接后端的真实设置
  const [deepseekKey, setDeepseekKey] = useState('')
  const [keySet, setKeySet] = useState(false)
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [model, setModel] = useState('deepseek-chat')
  const [theme, setTheme] = useState('暖白')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // 受管资料库(仓库)根:真实接后端。空=未配置→一键整理回退程序内部目录。
  const [repoRoot, setRepoRoot] = useState('')
  const [repoMsg, setRepoMsg] = useState<string | null>(null)
  const [repoErr, setRepoErr] = useState<string | null>(null)
  const [repoPickerOpen, setRepoPickerOpen] = useState(false)
  const [repoOrganizing, setRepoOrganizing] = useState(false)

  // 「即将接入」折叠区(默认收起)
  const [soonOpen, setSoonOpen] = useState(false)

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
      setRepoMsg(
        saved.repository_configured
          ? '仓库已配置。以后上传/接入的文件将进此文件夹；现有文件点「整理进仓库」搬入。'
          : '已解除仓库，整理回退程序内部目录',
      )
    } catch (e) {
      setRepoErr((e as Error).message) // 后端 400 文案(不存在/不可写/嵌套 uploads…)
    }
  }

  /** 存量迁移:把已落在内部 uploads 的现有项目文件搬进仓库(幂等可重复点)。 */
  const organizeToRepo = async () => {
    setRepoMsg(null)
    setRepoErr(null)
    setRepoOrganizing(true)
    try {
      const r = await api.organizeToRepository()
      const extra = [
        r.skipped ? `已在仓库 ${r.skipped}` : '',
        r.missing ? `源文件已不存在 ${r.missing}(陈旧记录,跳过)` : '',
        r.failed ? `失败 ${r.failed}` : '',
      ].filter(Boolean).join('，')
      setRepoMsg(`已整理进仓库：搬运 ${r.moved} 个文件${extra ? `（${extra}）` : ''}。`)
    } catch (e) {
      setRepoErr((e as Error).message)
    } finally {
      setRepoOrganizing(false)
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
      setSaveMsg('已保存到本机')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <>
      <div className={'setmask' + (open ? ' show' : '')} onClick={onClose} />
      <aside className={'setdrawer' + (open ? ' show' : '')} aria-label="设置">
        <div className="sethead">
          <div className="sett" style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Settings size={15} /> 设置</div>
          <button className="setx" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="setbody">
          {/* 1 AI 引擎与密钥（真实生效） */}
          <div className="setsec">
            <div className="setsech">AI 引擎与密钥</div>
            <div className="setsecd">研判、共创、纪要等 AI 能力由此点亮</div>
            <div className="setnote">
              <Lock size={12} style={{ verticalAlign: -2, marginRight: 4 }} />密钥仅存本机，不写入源码、不上传云端。界面只掩码显示，后端不回吐明文。
            </div>
            <div className="engrow">
              <span className="en">DeepSeek</span>
              <span className={'badge ' + (keySet ? 'on2' : 'off2')}>{keySet ? '已配置' : '未配置'}</span>
              <KeyInput
                value={deepseekKey}
                onChange={setDeepseekKey}
                placeholder={keySet ? '已配置，留空保持不变' : '粘贴 DeepSeek API Key'}
              />
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
            <div className="setbtns">
              <button className="btn" onClick={save}>
                保存配置
              </button>
              {saveMsg && <span style={{ fontSize: 12, color: 'var(--ok)', alignSelf: 'center' }}>{saveMsg}</span>}
              {err && <span style={{ fontSize: 12, color: 'var(--red)', alignSelf: 'center' }}>{err}</span>}
            </div>
          </div>

          {/* 2 受管资料库（真实生效） */}
          <div className="setsec">
            <div className="setsech">受管资料库</div>
            <div className="setsecd">「一键整理」接入的文件放进哪个文件夹</div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">
                  仓库文件夹
                  <span
                    className="chip"
                    style={{ marginLeft: 8, fontSize: 10, background: repoRoot ? 'var(--ok)' : 'var(--line2)', color: repoRoot ? '#fff' : 'var(--mut)' }}
                  >
                    {repoRoot ? '已配置' : '未配置'}
                  </span>
                </div>
                <div className="d" style={{ wordBreak: 'break-all' }}>
                  {repoRoot || '未配置时，文件放在程序内部目录（也能正常用）'}
                </div>
                {repoMsg && <div className="d" style={{ color: 'var(--ok)' }}>{repoMsg}</div>}
                {repoErr && <div className="d" style={{ color: 'var(--red)' }}>{repoErr}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn" onClick={() => setRepoPickerOpen(true)}>
                  {repoRoot ? '更改仓库' : '选择仓库文件夹'}
                </button>
                {repoRoot && (
                  <button
                    className="anbtn"
                    disabled={repoOrganizing}
                    onClick={organizeToRepo}
                    title="把现有项目文件从程序内部搬进仓库 {仓库}/{项目名}/"
                  >
                    {repoOrganizing ? '整理中…' : '整理进仓库'}
                  </button>
                )}
                {repoRoot && (
                  <button className="anbtn" onClick={() => saveRepository('')} title="解除配置,整理回退程序内部目录">解除</button>
                )}
              </div>
            </div>
          </div>

          {/* 3 外观（主题真实生效） */}
          <div className="setsec">
            <div className="setsech">外观</div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">主题</div>
                <div className="d">随「保存配置」一起生效</div>
              </div>
              <SegSelect options={['暖白', '深色']} value={theme} onChange={setTheme} />
            </div>
          </div>

          {/* 4 隐私与关于（真实事实） */}
          <div className="setsec">
            <div className="setsech">隐私与关于</div>
            <div className="setrow">
              <div className="lbl">
                <div className="t">本地运行</div>
                <div className="d">数据不出本机</div>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok)' }}>
                <span className="statusdot"></span>已启用
              </span>
            </div>
            <div className="aboutrow">
              <b>版本</b>
              <span className="mono" style={{ fontSize: 11, color: 'var(--mut)' }}>
                v0.1.0
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
                React + FastAPI · 本地数据库
              </span>
            </div>
          </div>

          {/* 5 即将接入（默认折叠）—— 一切未接后端的能力统一收在这里,不冒充可用 */}
          <div className="setsec">
            <button
              type="button"
              onClick={() => setSoonOpen((v) => !v)}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <div className="setsech" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{soonOpen ? '▾' : '▸'}</span>即将接入
                <span style={{ fontSize: 11, color: 'var(--mut)', fontWeight: 400 }}>已在路线图上 · 接入后在此点亮</span>
              </div>
            </button>
            {soonOpen && (
              <div style={{ marginTop: 6 }}>
                <div className="setsecd">以下能力尚未接入，现在切换不会生效。</div>

                <div className="setsub">管理账号</div>
                <div className="setrow">
                  <div className="lbl">
                    <div className="t">管理员登录</div>
                    <div className="d">登录后启用「管理驾驶舱」权限门槛</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--mut)' }}>即将接入</span>
                </div>

                <div className="setsub">更多 AI 引擎</div>
                {['Kimi', 'ChatGPT', 'Claude', '即梦（生图）'].map((n) => (
                  <div className="setrow" key={n}>
                    <div className="lbl">
                      <div className="t">{n}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>即将接入</span>
                  </div>
                ))}

                <div className="setsub">知识库进阶</div>
                {[
                  ['Obsidian Vault 引用', '直接引用你的笔记库'],
                  ['自动重建索引', '资料变化后自动刷新检索'],
                  ['甲方黑话词典开关', '内置词典参与检索与转译'],
                ].map(([t, d]) => (
                  <div className="setrow" key={t}>
                    <div className="lbl">
                      <div className="t">{t}</div>
                      <div className="d">{d}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>即将接入</span>
                  </div>
                ))}

                <div className="setsub">成果发送</div>
                {[
                  ['邮箱发送', 'SMTP 发成果到邮箱'],
                  ['企业微信发送', '群机器人推送'],
                  ['个人微信', '无官方接口 · 二维码转发'],
                ].map(([t, d]) => (
                  <div className="setrow" key={t}>
                    <div className="lbl">
                      <div className="t">{t}</div>
                      <div className="d">{d}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>即将接入</span>
                  </div>
                ))}

                <div className="setsub">其它</div>
                {[
                  ['语言 / 汇报 PPT 风格 / 默认板块', '个性化偏好'],
                  ['数字员工启停', '审图老法师 / 翻模小王子 等'],
                  ['云同步备份 · 导出全部数据', '内主外备'],
                ].map(([t, d]) => (
                  <div className="setrow" key={t}>
                    <div className="lbl">
                      <div className="t">{t}</div>
                      <div className="d">{d}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--mut)' }}>即将接入</span>
                  </div>
                ))}
              </div>
            )}
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
}

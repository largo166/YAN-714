import { useCallback, useEffect, useState } from 'react'
import { FileText, Folder, Package } from 'lucide-react'

import { api } from '@/lib/api'
import type { DirEntry } from '@/types/schemas'

interface Props {
  open: boolean
  /** 初始落点(如上次工作区路径);取其父目录起步,空则从盘符层起步。 */
  initialPath?: string
  /** true=只能选文件夹(仓库根场景),隐藏选文件、文件置灰不可选。 */
  foldersOnly?: boolean
  /** 选定一个文件夹或文件后回调真实绝对路径。 */
  onPick: (absPath: string) => void
  onClose: () => void
}

/** 目录选择弹窗:本应用非 Electron,浏览器拿不到文件夹绝对路径,
 *  改用后端只读「列目录」接口逐层浏览,选定文件夹或文件后返回真实绝对路径。 */
export default function FolderPicker({ open, initialPath = '', foldersOnly = false, onPick, onClose }: Props) {
  const [cwd, setCwd] = useState('')          // 当前目录(''=盘符层)
  const [parent, setParent] = useState<string | null>(null)
  const [level, setLevel] = useState<'drives' | 'dir'>('drives')
  const [drives, setDrives] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<DirEntry[]>([])
  const [items, setItems] = useState<DirEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<DirEntry | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    setErr(null)
    setSelectedFile(null)
    try {
      const d = await api.listDir(path)
      if (!d.accessible) {
        setErr(d.error || '无法访问该位置')
        return
      }
      setLevel(d.level === 'drives' ? 'drives' : 'dir')
      setCwd(d.path)
      setParent(d.parent)
      setDrives(d.drives)
      setShortcuts(d.shortcuts)
      setItems(d.items)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // 打开时:从 initialPath 的父目录起步(便于看到目标本身),无则盘符层
  useEffect(() => {
    if (!open) return
    const start = initialPath ? initialPath.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '') : ''
    load(start)
  }, [open, initialPath, load])

  if (!open) return null

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
    borderRadius: 8, cursor: 'pointer', fontSize: 13,
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, background: '#1b1a1755',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 14,
          maxWidth: 620, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px #1b1a1733',
        }}
      >
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--line2)' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>选择文件夹或文件</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: 'var(--mut)', cursor: 'pointer' }}>×</button>
        </div>

        {/* 工具条:上一级 + 当前路径 + 盘符快捷 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <button
            className="anbtn"
            disabled={level === 'drives'}
            onClick={() => load(parent ?? '')}
            title="上一级"
          >
            ↑ 上一级
          </button>
          <button className="anbtn" onClick={() => load('')} title="回到此电脑(盘符)">💻 此电脑</button>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--mut)', wordBreak: 'break-all', flex: 1 }}>
            {level === 'drives' ? '此电脑 · 选择磁盘' : cwd}
          </span>
        </div>

        {/* 常用位置常驻工具条:任意层级一键直达 桌面/主目录/文档/下载（不必先回盘符层） */}
        {shortcuts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--mut)' }}>常用位置</span>
            {shortcuts.map((s) => (
              <button
                key={s.abs_path}
                className="anbtn"
                onClick={() => load(s.abs_path)}
                title={s.abs_path}
                style={{ fontSize: 12 }}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* 列表体 */}
        <div style={{ padding: '8px 12px', overflow: 'auto', flex: 1, minHeight: 200 }}>
          {loading && <div style={{ color: 'var(--mut)', fontSize: 12, padding: 10 }}>加载中…</div>}
          {err && <div style={{ color: 'var(--red)', fontSize: 12, padding: 10 }}>{err}</div>}

          {!loading && !err && level === 'drives' && (
            <div style={{ fontSize: 11, color: 'var(--mut)', padding: '4px 10px 2px' }}>磁盘</div>
          )}

          {!loading && !err && level === 'drives' && drives.map((d) => (
            <div key={d} style={rowStyle} onMouseDown={(e) => e.preventDefault()} onClick={() => load(d)}
                 onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span>💽</span><b>{d}</b>
            </div>
          ))}

          {!loading && !err && level === 'dir' && items.length === 0 && (
            <div style={{ color: 'var(--mut)', fontSize: 12, padding: 10 }}>（此文件夹为空，或没有可显示的项）</div>
          )}

          {!loading && !err && level === 'dir' && items.map((it) => {
            const isSel = selectedFile?.abs_path === it.abs_path
            return (
              <div
                key={it.abs_path}
                style={{
                  ...rowStyle,
                  background: isSel ? 'var(--terra)' : 'transparent',
                  color: isSel ? '#fff' : 'var(--ink)',
                  opacity: foldersOnly && !it.is_dir ? 0.4 : 1,
                  cursor: foldersOnly && !it.is_dir ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (it.is_dir) load(it.abs_path)
                  else if (!foldersOnly) setSelectedFile(isSel ? null : it)
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'var(--panel2)' }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                title={it.is_dir ? '双击进入' : (foldersOnly ? '仓库根只能选文件夹' : (it.supported ? '可接入文件' : '不可解析(整理时会跳过)'))}
              >
                <span style={{ display: 'inline-flex' }}>{it.is_dir ? <Folder size={14} /> : it.supported ? <FileText size={14} /> : <Package size={14} />}</span>
                <span style={{ flex: 1, wordBreak: 'break-all' }}>{it.name}</span>
                {!it.is_dir && !it.supported && (
                  <span style={{ fontSize: 10, color: isSel ? '#fff' : 'var(--mut)' }}>不可解析</span>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部:选定文件夹 / 选定文件 / 取消 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--line2)', flexWrap: 'wrap' }}>
          <button
            className="btn"
            disabled={level !== 'dir'}
            onClick={() => onPick(cwd)}
            style={{ background: 'var(--terra)', color: '#fff' }}
          >
            ✓ 选定当前文件夹
          </button>
          {!foldersOnly && (
            <button className="btn" disabled={!selectedFile} onClick={() => selectedFile && onPick(selectedFile.abs_path)}>
              选定此文件{selectedFile ? `（${selectedFile.name}）` : ''}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="anbtn" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

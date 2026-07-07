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

/* 海天深色配色(与 CleanupWizard/SettingsOverlay 抽屉统一,不引入新主题系统) */
const C = {
  scrim: 'rgba(6,8,10,.62)',
  panel: 'rgba(12,14,17,.98)',
  border: 'rgba(127,179,207,.16)',
  line: 'rgba(127,179,207,.08)',
  ink: '#e8eef2',
  mut: 'rgba(161,165,170,.72)',
  mut2: 'rgba(161,165,170,.45)',
  hover: 'rgba(127,179,207,.08)',
  sel: 'rgba(127,179,207,.16)',
  pri: '#7fb3cf',
}
const btnStyle: React.CSSProperties = {
  border: `0.5px solid ${C.border}`, background: 'transparent', color: C.mut,
  borderRadius: 999, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
}

/** 目录选择弹窗:本应用非 Electron,浏览器拿不到文件夹绝对路径,
 *  改用后端只读「列目录」接口逐层浏览,选定文件夹或文件后返回真实绝对路径。
 *  配色海天深色化(2026-07 最小样式修正):不改结构/逻辑,仅统一深色系。 */
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
        position: 'fixed', inset: 0, zIndex: 9998, background: C.scrim, backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.panel, border: `0.5px solid ${C.border}`, borderRadius: 14,
          maxWidth: 620, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,.5)', color: C.ink,
        }}
      >
        {/* 头部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `0.5px solid ${C.border}` }}>
          <h3 style={{ margin: 0, fontSize: 15, color: C.ink, fontWeight: 400, letterSpacing: '.06em' }}>选择文件夹或文件</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: C.mut, cursor: 'pointer' }}>×</button>
        </div>

        {/* 工具条:上一级 + 当前路径 + 盘符快捷 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', borderBottom: `0.5px solid ${C.line}`, flexWrap: 'wrap' }}>
          <button
            style={{ ...btnStyle, opacity: level === 'drives' ? 0.4 : 1, cursor: level === 'drives' ? 'default' : 'pointer' }}
            disabled={level === 'drives'}
            onClick={() => load(parent ?? '')}
            title="上一级"
          >
            ↑ 上一级
          </button>
          <button style={btnStyle} onClick={() => load('')} title="回到此电脑(盘符)">💻 此电脑</button>
          <span style={{ fontSize: 11.5, color: C.mut, wordBreak: 'break-all', flex: 1, fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>
            {level === 'drives' ? '此电脑 · 选择磁盘' : cwd}
          </span>
        </div>

        {/* 常用位置常驻工具条:任意层级一键直达 桌面/主目录/文档/下载（不必先回盘符层） */}
        {shortcuts.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 18px', borderBottom: `0.5px solid ${C.line}`, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: C.mut2 }}>常用位置</span>
            {shortcuts.map((s) => (
              <button
                key={s.abs_path}
                style={{ ...btnStyle, fontSize: 12 }}
                onClick={() => load(s.abs_path)}
                title={s.abs_path}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {/* 列表体 */}
        <div style={{ padding: '8px 12px', overflow: 'auto', flex: 1, minHeight: 200 }}>
          {loading && <div style={{ color: C.mut, fontSize: 12, padding: 10 }}>加载中…</div>}
          {err && <div style={{ color: '#e2777a', fontSize: 12, padding: 10 }}>{err}</div>}

          {!loading && !err && level === 'drives' && (
            <div style={{ fontSize: 11, color: C.mut2, padding: '4px 10px 2px' }}>磁盘</div>
          )}

          {!loading && !err && level === 'drives' && drives.map((d) => (
            <div key={d} style={{ ...rowStyle, color: C.ink }} onMouseDown={(e) => e.preventDefault()} onClick={() => load(d)}
                 onMouseEnter={(e) => (e.currentTarget.style.background = C.hover)}
                 onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <span>💽</span><b>{d}</b>
            </div>
          ))}

          {!loading && !err && level === 'dir' && items.length === 0 && (
            <div style={{ color: C.mut, fontSize: 12, padding: 10 }}>（此文件夹为空，或没有可显示的项）</div>
          )}

          {!loading && !err && level === 'dir' && items.map((it) => {
            const isSel = selectedFile?.abs_path === it.abs_path
            const dimmed = foldersOnly && !it.is_dir
            return (
              <div
                key={it.abs_path}
                style={{
                  ...rowStyle,
                  background: isSel ? C.sel : 'transparent',
                  color: dimmed ? C.mut2 : C.ink,
                  opacity: dimmed ? 0.5 : 1,
                  cursor: dimmed ? 'default' : 'pointer',
                }}
                onClick={() => {
                  if (it.is_dir) load(it.abs_path)
                  else if (!foldersOnly) setSelectedFile(isSel ? null : it)
                }}
                onMouseEnter={(e) => { if (!isSel && !dimmed) e.currentTarget.style.background = C.hover }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                title={it.is_dir ? '双击进入' : (foldersOnly ? '仓库根只能选文件夹' : (it.supported ? '可接入文件' : '不可解析(整理时会跳过)'))}
              >
                <span style={{ display: 'inline-flex', color: it.is_dir ? C.pri : it.supported ? C.mut : C.mut2 }}>{it.is_dir ? <Folder size={14} /> : it.supported ? <FileText size={14} /> : <Package size={14} />}</span>
                <span style={{ flex: 1, wordBreak: 'break-all' }}>{it.name}</span>
                {!it.is_dir && !it.supported && (
                  <span style={{ fontSize: 10, color: C.mut2 }}>不可解析</span>
                )}
              </div>
            )
          })}
        </div>

        {/* 底部:选定文件夹 / 选定文件 / 取消 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: `0.5px solid ${C.border}`, flexWrap: 'wrap' }}>
          <button
            style={{
              border: 'none', borderRadius: 999, padding: '6px 16px', fontSize: 12.5,
              background: level !== 'dir' ? 'rgba(127,179,207,.25)' : C.pri, color: '#0a0c0e', fontWeight: 500,
              cursor: level !== 'dir' ? 'default' : 'pointer', opacity: level !== 'dir' ? 0.5 : 1,
            }}
            disabled={level !== 'dir'}
            onClick={() => onPick(cwd)}
            title="选定当前文件夹"
          >
            选定此文件夹
          </button>
          {!foldersOnly && (
            <button
              style={{ ...btnStyle, opacity: !selectedFile ? 0.4 : 1, cursor: !selectedFile ? 'default' : 'pointer' }}
              disabled={!selectedFile}
              onClick={() => selectedFile && onPick(selectedFile.abs_path)}
              title={selectedFile ? selectedFile.name : ''}
            >
              选定此文件
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button style={btnStyle} onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

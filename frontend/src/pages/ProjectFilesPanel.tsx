import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'

import { api } from '@/lib/api'
import type { ProjectFile } from '@/types/schemas'

const ACCEPT = '.txt,.md,.pdf,.docx,.pptx'
const PARSE_LABEL: Record<string, { text: string; cls: string }> = {
  ok: { text: '已解析', cls: 'live' },
  ok_truncated: { text: '已解析·截断', cls: 'live' }, // 读到正文但触顶上限,停在第N页(仍是真材料)
  metadata_only: { text: '未提取到正文·见说明', cls: 'demo' }, // 扫描件/加密/损坏:真提不出内容(与大小无关)
  extraction_timeout: { text: '提取超时·待人工', cls: 'demo' },
  pending: { text: '待解析', cls: 'demo' },
  empty: { text: '空内容', cls: 'demo' },
  unsupported: { text: '不支持', cls: 'fail' },
  failed: { text: '解析失败', cls: 'fail' },
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 4D 文件域：拖拽/选择上传 + 解析状态 + 入库回流 + 软删可恢复。保留原版 legacy 视觉。 */
export default function ProjectFilesPanel({
  projectId,
  onIndexed,
}: {
  projectId: number | null
  onIndexed?: () => void
}) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(() => {
    if (projectId == null) return
    api
      .listProjectFiles(projectId)
      .then((d) => setFiles(d.items))
      .catch((e: Error) => setErr(e.message))
  }, [projectId])

  useEffect(() => {
    setFiles([])
    setErr(null)
    setMsg(null)
    reload()
  }, [reload])

  const doUpload = useCallback(
    async (fileList: FileList | File[]) => {
      if (projectId == null) return
      setErr(null)
      setMsg(null)
      const arr = Array.from(fileList)
      for (const f of arr) {
        setUploading(true)
        setProgress(0)
        try {
          await api.uploadProjectFile(projectId, f, setProgress)
        } catch (e) {
          setErr((e as Error).message)
        }
      }
      setUploading(false)
      setProgress(0)
      reload()
    },
    [projectId, reload],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) doUpload(e.dataTransfer.files)
  }

  const onIndex = async (fileId: number) => {
    if (projectId == null) return
    try {
      const r = await api.indexProjectFile(projectId, fileId)
      setMsg(`已入库：《${r.title}》`)
      reload()
      onIndexed?.()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const onDelete = async (fileId: number) => {
    if (projectId == null) return
    try {
      const r = await api.deleteProjectFile(projectId, fileId)
      setMsg(`已移入回收（可恢复，时间戳 ${r.trash_timestamp}）`)
      reload()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  if (projectId == null) {
    return (
      <div className="card mt">
        <div className="ct">项目文件</div>
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '8px 0' }}>请先选择一个项目。</div>
      </div>
    )
  }

  return (
    <div className="card mt">
      <div className="ct">
        项目文件 <span className="statpill live">已接入</span>
      </div>

      {/* 拖拽 + 选择上传 */}
      <div
        data-drop-zone="project-files"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragOver ? 'var(--terra)' : 'var(--line2)'}`,
          borderRadius: 10,
          padding: '18px 14px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'var(--terra-soft)' : 'transparent',
          color: 'var(--mut)',
          fontSize: 13,
          marginBottom: 10,
        }}
      >
        拖拽文件到此，或点击选择（支持 txt / md / pdf / docx / pptx，单文件 ≤ 25MB）
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files?.length) doUpload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {uploading && (
        <div className="prog" style={{ marginBottom: 10 }}>
          <i style={{ width: `${progress}%` }}></i>
        </div>
      )}
      {msg && <div style={{ color: 'var(--ok)', fontSize: 12.5, marginBottom: 8 }}>{msg}</div>}
      {err && <div style={{ color: 'var(--red)', fontSize: 12.5, marginBottom: 8 }}>{err}</div>}

      {/* 文件列表 */}
      {files.length === 0 ? (
        <div style={{ color: 'var(--mut)', fontSize: 13, padding: '4px 0' }}>暂无文件。</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {files.map((f) => {
            const p = PARSE_LABEL[f.parse_status] ?? PARSE_LABEL.pending
            return (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '8px 10px',
                  border: '1px solid var(--line2)',
                  borderRadius: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <FileText size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{f.filename} <span className={'statpill ' + p.cls}>{p.text}</span>
                    {f.indexed_doc_id > 0 && <span className="statpill live">已入库</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mut)' }}>
                    {fmtSize(f.size)}
                    {f.parse_error && ` · ${f.parse_error}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    className="anbtn"
                    disabled={
                      !['ok', 'ok_truncated', 'metadata_only'].includes(f.parse_status) ||
                      f.indexed_doc_id > 0
                    }
                    onClick={() => onIndex(f.id)}
                    title={
                      f.parse_status === 'metadata_only'
                        ? '未提取到正文（扫描件/加密/损坏），已登记，可入库靠文件名/类型检索'
                        : f.parse_status === 'ok_truncated'
                          ? '正文超上限已截断（仍是真材料），可入库'
                          : f.parse_status !== 'ok'
                            ? '仅可解析文件可入库'
                            : '索引到知识库'
                    }
                  >
                    入库
                  </button>
                  <button className="anbtn" style={{ color: 'var(--red)', borderColor: 'rgba(255,90,90,.35)' }} onClick={() => onDelete(f.id)}>
                    删除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

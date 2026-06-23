import {
  ChatSessionDetailSchema,
  ChatSessionListSchema,
  ChatSessionSchema,
  IndexFileOutSchema,
  KnowledgeDocListSchema,
  KnowledgeDocSchema,
  KnowledgeSearchOutSchema,
  MeetingDetailSchema,
  MeetingListSchema,
  MeetingMinuteSchema,
  ProjectAnalysisListSchema,
  ProjectAnalysisSchema,
  ProjectFileDetailSchema,
  ProjectFileListSchema,
  ProjectListSchema,
  ProjectMilestoneListSchema,
  ProjectOverviewSchema,
  ProjectRiskListSchema,
  ProjectSchema,
  ReusableAssetListSchema,
  SkillListSchema,
  SendMessageOutSchema,
  SettingsSchema,
  TencentSyncSchema,
  type ChatSession,
  type ChatSessionDetail,
  type KnowledgeDoc,
  type KnowledgeSearchOut,
  type MeetingDetail,
  type MeetingMinute,
  type Project,
  type ProjectAnalysis,
  type ProjectMilestone,
  type ProjectOverview,
  type ProjectRisk,
  type ReusableAsset,
  type SkillList,
  type ProjectFileDetail,
  type ProjectInput,
  type ProjectList,
  type SendMessageOut,
  type Settings,
  type SettingsInput,
  type TencentSync,
} from '@/types/schemas'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body?.detail) detail = body.detail
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(`API ${res.status}: ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export interface HealthStatus {
  status: string
  service: string
  database: string
}

export interface SendMessageInput {
  message: string
  use_knowledge?: boolean
  knowledge_query?: string
  top_k?: number
}

export const api = {
  baseUrl: BASE_URL,

  async health(): Promise<HealthStatus> {
    return request<HealthStatus>('/health')
  },

  // ── 项目 ──
  async listProjects(): Promise<ProjectList> {
    return ProjectListSchema.parse(await request('/api/projects'))
  },
  async getProject(id: number): Promise<Project> {
    return ProjectSchema.parse(await request(`/api/projects/${id}`))
  },
  async createProject(input: ProjectInput): Promise<Project> {
    return ProjectSchema.parse(
      await request('/api/projects', { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async updateProject(id: number, input: Partial<ProjectInput>): Promise<Project> {
    return ProjectSchema.parse(
      await request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    )
  },
  async deleteProject(id: number): Promise<void> {
    await request(`/api/projects/${id}`, { method: 'DELETE' })
  },
  async getProjectOverview(id: number): Promise<ProjectOverview> {
    return ProjectOverviewSchema.parse(await request(`/api/projects/${id}/overview`))
  },
  async getProjectMilestones(id: number): Promise<ProjectMilestone[]> {
    return ProjectMilestoneListSchema.parse(await request(`/api/projects/${id}/milestones`)).items
  },
  async getProjectRisks(id: number): Promise<ProjectRisk[]> {
    return ProjectRiskListSchema.parse(await request(`/api/projects/${id}/risks`)).items
  },
  async getProjectReusableAssets(id: number): Promise<ReusableAsset[]> {
    return ReusableAssetListSchema.parse(await request(`/api/projects/${id}/reusable-assets`)).items
  },

  // ── 共创营地：内置技能目录（只读） ──
  async listSkills(): Promise<SkillList> {
    return SkillListSchema.parse(await request('/api/skills'))
  },

  // ── 设置 ──
  async getSettings(): Promise<Settings> {
    return SettingsSchema.parse(await request('/api/settings'))
  },
  async updateSettings(input: SettingsInput): Promise<Settings> {
    return SettingsSchema.parse(
      await request('/api/settings', { method: 'PUT', body: JSON.stringify(input) }),
    )
  },

  // ── 4B: 聊天 ──
  async listChatSessions() {
    return ChatSessionListSchema.parse(await request('/api/chat/sessions'))
  },
  async createChatSession(title = '新会话'): Promise<ChatSession> {
    return ChatSessionSchema.parse(
      await request('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ title }) }),
    )
  },
  async getChatSession(id: number): Promise<ChatSessionDetail> {
    return ChatSessionDetailSchema.parse(await request(`/api/chat/sessions/${id}`))
  },
  async deleteChatSession(id: number): Promise<void> {
    await request(`/api/chat/sessions/${id}`, { method: 'DELETE' })
  },
  async sendMessage(sessionId: number, input: SendMessageInput): Promise<SendMessageOut> {
    return SendMessageOutSchema.parse(
      await request(`/api/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },

  // ── 4B: 知识库 ──
  async listKnowledgeDocs() {
    return KnowledgeDocListSchema.parse(await request('/api/knowledge/documents'))
  },
  async getKnowledgeDoc(id: number): Promise<KnowledgeDoc> {
    return KnowledgeDocSchema.parse(await request(`/api/knowledge/documents/${id}`))
  },
  async createKnowledgeDoc(input: {
    title: string
    content_text?: string
    source_path?: string
    file_type?: string
    tags?: string
  }): Promise<KnowledgeDoc> {
    return KnowledgeDocSchema.parse(
      await request('/api/knowledge/documents', { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async deleteKnowledgeDoc(id: number): Promise<void> {
    await request(`/api/knowledge/documents/${id}`, { method: 'DELETE' })
  },
  async searchKnowledge(query: string, topK = 5): Promise<KnowledgeSearchOut> {
    return KnowledgeSearchOutSchema.parse(
      await request('/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify({ query, top_k: topK }),
      }),
    )
  },
  async reindexKnowledge(): Promise<{ reindexed: number; engine: string }> {
    return request('/api/knowledge/reindex', { method: 'POST' })
  },

  // ── 4C: 工作区目录 + 安全清理 ──
  async workspaceStatus(): Promise<{ workspace_path: string; accessible: boolean }> {
    return request('/api/workspace/status')
  },
  async workspaceConfig(path: string): Promise<{ workspace_path: string; accessible: boolean }> {
    return request('/api/workspace/config', { method: 'POST', body: JSON.stringify({ path }) })
  },
  async workspaceScan(): Promise<WorkspaceScan> {
    return request('/api/workspace/scan', { method: 'POST' })
  },
  async cleanupPreview(): Promise<CleanupPreview> {
    return request('/api/workspace/cleanup/preview', { method: 'POST' })
  },

  // ── 4D: 项目文件 ──
  /** 上传文件（XHR 以拿到上传进度；onProgress 0-100）。 */
  uploadProjectFile(
    projectId: number,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<ProjectFileDetail> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/api/projects/${projectId}/files`)
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(ProjectFileDetailSchema.parse(JSON.parse(xhr.responseText)))
          } catch (err) {
            reject(err instanceof Error ? err : new Error('上传响应解析失败'))
          }
        } else {
          let detail = xhr.statusText
          try {
            const body = JSON.parse(xhr.responseText) as { detail?: string }
            if (body?.detail) detail = body.detail
          } catch {
            // 忽略
          }
          reject(new Error(`上传失败 ${xhr.status}: ${detail}`))
        }
      }
      xhr.onerror = () => reject(new Error('上传网络错误'))
      xhr.send(form)
    })
  },
  async listProjectFiles(projectId: number) {
    return ProjectFileListSchema.parse(await request(`/api/projects/${projectId}/files`))
  },
  async getProjectFile(projectId: number, fileId: number): Promise<ProjectFileDetail> {
    return ProjectFileDetailSchema.parse(
      await request(`/api/projects/${projectId}/files/${fileId}`),
    )
  },
  async deleteProjectFile(
    projectId: number,
    fileId: number,
  ): Promise<{ ok: boolean; file_id: number; trash_timestamp: string }> {
    return request(`/api/projects/${projectId}/files/${fileId}`, { method: 'DELETE' })
  },
  async restoreProjectFile(
    projectId: number,
    fileId: number,
    timestamp: string,
  ): Promise<ProjectFileDetail> {
    return ProjectFileDetailSchema.parse(
      await request(
        `/api/projects/${projectId}/files/${fileId}/restore?timestamp=${encodeURIComponent(timestamp)}`,
        { method: 'POST' },
      ),
    )
  },
  async indexProjectFile(projectId: number, fileId: number) {
    return IndexFileOutSchema.parse(
      await request(`/api/projects/${projectId}/files/${fileId}/index`, { method: 'POST' }),
    )
  },

  // ── 4D: AI 研判 ──
  async analyzeProject(projectId: number, task: string, topK = 5): Promise<ProjectAnalysis> {
    return ProjectAnalysisSchema.parse(
      await request(`/api/projects/${projectId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ task, top_k: topK }),
      }),
    )
  },
  async listProjectAnalyses(projectId: number) {
    return ProjectAnalysisListSchema.parse(
      await request(`/api/projects/${projectId}/analyses`),
    )
  },
  analysisExportUrl(projectId: number, analysisId: number): string {
    return `${BASE_URL}/api/projects/${projectId}/analyses/${analysisId}/export.md`
  },

  // ── 会议成果交付中心 ──
  async createMeeting(
    projectId: number,
    input: { title: string; meeting_date?: string; attendees?: string; raw_text?: string },
  ): Promise<MeetingDetail> {
    return MeetingDetailSchema.parse(
      await request(`/api/projects/${projectId}/meetings`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  },
  /** 上传材料(txt/md/docx/pdf)解析为会议记录并建会议（XHR for FormData）。 */
  createMeetingFromMaterial(
    projectId: number,
    file: File,
    meta: { title: string; meeting_date?: string; attendees?: string },
  ): Promise<MeetingDetail> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('title', meta.title)
      form.append('meeting_date', meta.meeting_date ?? '')
      form.append('attendees', meta.attendees ?? '')
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/api/projects/${projectId}/meetings/material`)
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(MeetingDetailSchema.parse(JSON.parse(xhr.responseText)))
          } catch (e) {
            reject(e instanceof Error ? e : new Error('解析失败'))
          }
        } else {
          let detail = xhr.statusText
          try {
            const b = JSON.parse(xhr.responseText) as { detail?: string }
            if (b?.detail) detail = b.detail
          } catch {
            /* ignore */
          }
          reject(new Error(`上传失败 ${xhr.status}: ${detail}`))
        }
      }
      xhr.onerror = () => reject(new Error('上传网络错误'))
      xhr.send(form)
    })
  },
  async listMeetings(projectId: number) {
    return MeetingListSchema.parse(await request(`/api/projects/${projectId}/meetings`))
  },
  async getMeeting(projectId: number, meetingId: number): Promise<MeetingDetail> {
    return MeetingDetailSchema.parse(
      await request(`/api/projects/${projectId}/meetings/${meetingId}`),
    )
  },
  async generateMinute(projectId: number, meetingId: number): Promise<MeetingMinute> {
    return MeetingMinuteSchema.parse(
      await request(`/api/projects/${projectId}/meetings/${meetingId}/minute`, { method: 'POST' }),
    )
  },
  async confirmMinute(
    projectId: number,
    meetingId: number,
    minuteId: number,
  ): Promise<MeetingMinute> {
    return MeetingMinuteSchema.parse(
      await request(
        `/api/projects/${projectId}/meetings/${meetingId}/minute/${minuteId}/confirm`,
        { method: 'POST' },
      ),
    )
  },
  /** Word 正式导出 URL（variant=external|internal）。 */
  minuteDocxUrl(projectId: number, meetingId: number, minuteId: number, variant: 'external' | 'internal' = 'external'): string {
    return `${BASE_URL}/api/projects/${projectId}/meetings/${meetingId}/minute/${minuteId}/export.docx?variant=${variant}`
  },
  /** 打印友好 HTML URL（前端新窗口打开后 window.print()）。 */
  minutePrintUrl(projectId: number, meetingId: number, minuteId: number, internal = false): string {
    return `${BASE_URL}/api/projects/${projectId}/meetings/${meetingId}/minute/${minuteId}/print${internal ? '?internal=true' : ''}`
  },
  /** 一键创建腾讯会议（零输入）。 */
  async quickTencentMeeting(projectId: number): Promise<MeetingDetail> {
    return MeetingDetailSchema.parse(
      await request(`/api/projects/${projectId}/tencent/quick`, { method: 'POST' }),
    )
  },
  /** 腾讯会议：为已有会议创建真实会议（二次确认）。 */
  async createTencentMeeting(projectId: number, meetingId: number): Promise<MeetingDetail> {
    return MeetingDetailSchema.parse(
      await request(`/api/projects/${projectId}/meetings/${meetingId}/tencent`, {
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    )
  },
  /** 腾讯会议：会后同步智能纪要/转写。 */
  async syncTencentMinutes(projectId: number, meetingId: number): Promise<TencentSync> {
    return TencentSyncSchema.parse(
      await request(`/api/projects/${projectId}/meetings/${meetingId}/tencent/sync`, { method: 'POST' }),
    )
  },
}

export interface WsFile {
  path: string
  abs_path: string
  size: number
  mtime: string
  ext: string
  reason: string
}
export interface WorkspaceScan {
  accessible: boolean
  root?: string
  error?: string
  total_files: number
  total_dirs: number
  total_size: number
  type_stats: Record<string, number>
  recent_files: WsFile[]
  large_files: WsFile[]
  auto_cleanable: WsFile[]
  review_items: WsFile[]
}
export interface CleanupPreview {
  accessible: boolean
  error?: string
  count?: number
  total_size?: number
  review_count?: number
  candidates?: WsFile[]
  note?: string
}

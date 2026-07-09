import { z } from 'zod'
import {
  ChatSessionDetailSchema,
  ChatSessionListSchema,
  ChatSessionSchema,
  IndexFileOutSchema,
  KnowledgeDocListSchema,
  KnowledgeDocSchema,
  GenerateMetadataOutSchema,
  ProjectCognitionSchema,
  CognitionExtractOutSchema,
  CrossProjectTypeOutSchema,
  CrossProjectItemOutSchema,
  PrecipitateOutSchema,
  StageProgressOutSchema,
  ReflowResultOutSchema,
  KnowledgeSearchOutSchema,
  MeetingDetailSchema,
  MeetingListSchema,
  MeetingMinuteSchema,
  TranscribeCapabilitySchema,
  TranscribeJobSchema,
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
  ProjectProgressSchema,
  ResultSendChannelsSchema,
  ResultSendPreviewSchema,
  ReflowSchema,
  TeamAssignmentSchema,
  SkillListSchema,
  SkillRunSchema,
  SkillCommandSchema,
  SkillCommandListSchema,
  SkillResultListSchema,
  type SkillCommand,
  type SkillCommandList,
  type SkillResultList,
  AgentListSchema,
  AgentRunSchema,
  TeamMemberListSchema,
  TeamMemberSchema,
  TickerListSchema,
  BroadcastListSchema,
  BroadcastSchema,
  BossDashboardSchema,
  WorkloadListSchema,
  AiUsageListSchema,
  DirListSchema,
  type DirList,
  NotConfiguredListSchema,
  KnowledgeStatsSchema,
  SendMessageOutSchema,
  SettingsSchema,
  TencentSyncSchema,
  type ChatSession,
  type ChatSessionDetail,
  type KnowledgeDoc,
  type GenerateMetadataOut,
  type ProjectCognition,
  type CognitionExtractOut,
  type KnowledgeSearchOut,
  type MeetingDetail,
  type MeetingMinute,
  type TranscribeJob,
  type Project,
  type ProjectAnalysis,
  type ProjectMilestone,
  type ProjectOverview,
  type ProjectRisk,
  type ReusableAsset,
  type ProjectProgress,
  type ResultSendChannel,
  type ResultSendPreview,
  type Reflow,
  type TeamAssignment,
  type SkillList,
  type SkillRun,
  type Agent,
  type AgentRun,
  type TeamMember,
  type TickerItem,
  type Broadcast,
  type BossDashboard,
  type WorkloadItem,
  type AiUsageItem,
  type KnowledgeStats,
  type ProjectFileDetail,
  type ProjectInput,
  type ProjectList,
  type SendMessageOut,
  type Settings,
  type SettingsInput,
  type TencentSync,
} from '@/types/schemas'

// API 基址：运行时按页面来源判定，避免构建期 env 缓存坑。
// - 显式 VITE_API_BASE_URL（非空）优先。
// - Vite 开发服务器(端口 5173) → 打本地 FastAPI 8000。
// - 其余(exe / 同源托管 dist，任意端口) → 相对同源('')，请求走 /api。
function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (explicit) return explicit
  if (typeof window !== 'undefined' && window.location.port === '5173') return 'http://127.0.0.1:8000'
  return ''
}
const BASE_URL: string = resolveApiBase()

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
  project_id?: number
  top_k?: number
  attached_file_ids?: number[]
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
  async getStageProgress(id: number): Promise<import('@/types/schemas').StageProgressOut> {
    return StageProgressOutSchema.parse(await request(`/api/projects/${id}/stage-progress`))
  },
  // ── 回流契约（阶段5）──
  async reflowAnalysis(analysisId: number): Promise<import('@/types/schemas').ReflowResultOut> {
    return ReflowResultOutSchema.parse(
      await request(`/api/reflow/analysis/${analysisId}`, { method: 'POST' }),
    )
  },
  async reflowMinuteToKb(minuteId: number): Promise<import('@/types/schemas').ReflowResultOut> {
    return ReflowResultOutSchema.parse(
      await request(`/api/reflow/minute/${minuteId}`, { method: 'POST' }),
    )
  },
  async getProjectProgress(id: number): Promise<ProjectProgress> {
    return ProjectProgressSchema.parse(await request(`/api/projects/${id}/progress`))
  },

  // ── 共创营地：内置技能目录（只读） ──
  async listSkills(): Promise<SkillList> {
    return SkillListSchema.parse(await request('/api/skills'))
  },
  async runSkill(projectId: number, skillId: string, input = '', model = '', sessionId = 0, imagePrompt = '', audience = '', mode = '', signal?: AbortSignal): Promise<SkillRun> {
    return SkillRunSchema.parse(
      await request(`/api/projects/${projectId}/skills/${skillId}/run`, {
        method: 'POST',
        body: JSON.stringify({ input, model, session_id: sessionId, image_prompt: imagePrompt, audience, mode }),
        signal,
      }),
    )
  },
  /** 图生图:用项目里的「素材」资产作参考图生成(P·真 img2img)。模型默认 gemini 编辑模型。 */
  async generateImageFromAssets(projectId: number, prompt: string, refAssetIds: number[], model = 'gemini-3-pro-image-preview', signal?: AbortSignal): Promise<SkillRun> {
    return SkillRunSchema.parse(
      await request(`/api/projects/${projectId}/skills/img/run`, {
        method: 'POST',
        body: JSON.stringify({ input: prompt, model, ref_asset_ids: refAssetIds }),
        signal,
      }),
    )
  },
  /** 斜杠命令:文本类直跑(result)/出图轻确认(confirm_image)/非命令(not_command)。 */
  async runCommand(projectId: number, text: string, sessionId = 0, model = '', signal?: AbortSignal): Promise<SkillCommand> {
    return SkillCommandSchema.parse(
      await request(`/api/projects/${projectId}/command`, {
        method: 'POST',
        body: JSON.stringify({ text, session_id: sessionId, model }),
        signal,
      }),
    )
  },
  async listSkillCommands(): Promise<SkillCommandList> {
    return SkillCommandListSchema.parse(await request('/api/skill-commands'))
  },
  async listSkillResults(projectId: number): Promise<SkillResultList> {
    return SkillResultListSchema.parse(await request(`/api/projects/${projectId}/skill-results`))
  },
  /** 生图成果卡的图片 URL(按项目 stored_path 取项目内图片)。 */
  projectImageUrl(projectId: number, storedPath: string): string {
    return `${BASE_URL}/api/projects/${projectId}/image?path=${encodeURIComponent(storedPath)}`
  },
  /** PPT 大纲成果导出为 .pptx 的下载 URL(后端据已落库结构化 output_json 渲染)。 */
  skillResultPptxUrl(projectId: number, resultId: number): string {
    return `${BASE_URL}/api/projects/${projectId}/skill-results/${resultId}/export.pptx`
  },

  // ── 协作平台（C4）──
  async listAgents(): Promise<Agent[]> {
    return AgentListSchema.parse(await request('/api/agents')).items
  },
  async runAgent(agentId: string, projectId: number, input = ''): Promise<AgentRun> {
    return AgentRunSchema.parse(
      await request(`/api/agents/${agentId}/run`, {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId, input }),
      }),
    )
  },
  async listTeamMembers(): Promise<TeamMember[]> {
    return TeamMemberListSchema.parse(await request('/api/team/members')).items
  },
  async createTeamMember(input: { name: string; role?: string; duty?: string; birthday?: string }): Promise<TeamMember> {
    return TeamMemberSchema.parse(
      await request('/api/team/members', { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async updateTeamMember(id: number, input: { name?: string; role?: string; duty?: string; birthday?: string }): Promise<TeamMember> {
    return TeamMemberSchema.parse(
      await request(`/api/team/members/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    )
  },
  async deleteTeamMember(id: number): Promise<void> {
    await request(`/api/team/members/${id}`, { method: 'DELETE' })
  },
  async createTeamAssignment(projectId: number, input: { member_id: number; task_title: string; due?: string }): Promise<TeamAssignment> {
    return TeamAssignmentSchema.parse(
      await request(`/api/projects/${projectId}/team-assignments`, { method: 'POST', body: JSON.stringify(input) }),
    )
  },
  async getTicker(): Promise<TickerItem[]> {
    return TickerListSchema.parse(await request('/api/broadcast/ticker')).items
  },

  // ── 管理驾驶舱（C5）──
  async getBossDashboard(): Promise<BossDashboard> {
    return BossDashboardSchema.parse(await request('/api/boss/dashboard'))
  },
  async getWorkload(): Promise<WorkloadItem[]> {
    return WorkloadListSchema.parse(await request('/api/boss/workload')).items
  },
  async getAiUsage(): Promise<AiUsageItem[]> {
    return AiUsageListSchema.parse(await request('/api/boss/ai-usage')).items
  },
  async getFeishuBoard(): Promise<{ status: string }> {
    return NotConfiguredListSchema.parse(await request('/api/boss/feishu-board'))
  },
  async getBossComments(): Promise<{ status: string }> {
    return NotConfiguredListSchema.parse(await request('/api/boss/comments'))
  },
  async listBroadcasts(): Promise<Broadcast[]> {
    return BroadcastListSchema.parse(await request('/api/broadcast/broadcasts')).items
  },
  async createBroadcast(text: string): Promise<Broadcast> {
    return BroadcastSchema.parse(
      await request('/api/broadcast/broadcasts', { method: 'POST', body: JSON.stringify({ text }) }),
    )
  },

  // ── 数据基地：索引统计 ──
  async getKnowledgeStats(): Promise<KnowledgeStats> {
    return KnowledgeStatsSchema.parse(await request('/api/knowledge/stats'))
  },

  // ── 成果发送（D1，preview/not_configured，不真发）──
  async getResultSendChannels(): Promise<ResultSendChannel[]> {
    return ResultSendChannelsSchema.parse(await request('/api/result-send/channels')).items
  },
  async previewResultSend(content: string, channel: string): Promise<ResultSendPreview> {
    return ResultSendPreviewSchema.parse(
      await request('/api/result-send/preview', { method: 'POST', body: JSON.stringify({ content, channel }) }),
    )
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

  // ── 管理口令门槛(P1-6):本机口令防同屏误入,非网络级安全 ──
  async adminStatus(): Promise<{ configured: boolean }> {
    return (await request('/api/admin/status')) as { configured: boolean }
  },
  async adminSetup(password: string): Promise<{ ok: boolean }> {
    return (await request('/api/admin/setup', { method: 'POST', body: JSON.stringify({ password }) })) as { ok: boolean }
  },
  async adminLogin(password: string): Promise<{ ok: boolean }> {
    return (await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) })) as { ok: boolean }
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
  /** 库完整性体检(只读):四态计数 + root 脱节。真库清洗前置。 */
  async knowledgeHealth(): Promise<{
    total_records: number
    counts: { ok: number; missing: number; detached: number; orphan: number }
    root_detached: { storage_root: string; root_state: string; record_count: number }[]
  }> {
    return request('/api/knowledge/health')
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
  async generateDocMetadata(id: number): Promise<GenerateMetadataOut> {
    return GenerateMetadataOutSchema.parse(
      await request(`/api/knowledge/documents/${id}/generate-metadata`, { method: 'POST' }),
    )
  },

  // ── 项目结构化认知（P2 脊椎）──
  async listCognition(projectId: number): Promise<ProjectCognition[]> {
    return z.array(ProjectCognitionSchema).parse(await request(`/api/projects/${projectId}/cognition`))
  },
  /** 认知版本历史(阶段6 版本层):列出某认知重抽/确认前的快照,只读回看。 */
  async listCognitionVersions(
    projectId: number,
    cogId: number,
  ): Promise<
    { id: number; version: number; summary_md: string; module_status: string; snapshot_reason: string; created_at: string }[]
  > {
    return (await request(`/api/projects/${projectId}/cognition/${cogId}/versions`)) as never
  },
  /** 甲方诉求/黑话词典查询(原话→真实含义/设计影响/建议动作)。 */
  async querySlang(
    projectId: number,
    q = '',
  ): Promise<{ term: string; meaning: string; impact: string; action: string }[]> {
    const r = (await request(`/api/projects/${projectId}/slang?q=${encodeURIComponent(q)}`)) as {
      items: { term: string; meaning: string; impact: string; action: string }[]
    }
    return r.items
  },
  async listCognitionModules(
    projectId: number,
  ): Promise<{ module: string; label: string; implemented: boolean }[]> {
    const r = (await request(`/api/projects/${projectId}/cognition/modules`)) as {
      modules: { module: string; label: string; implemented: boolean }[]
    }
    return r.modules
  },
  async extractModule(projectId: number, module: string): Promise<CognitionExtractOut> {
    return CognitionExtractOutSchema.parse(
      await request(`/api/projects/${projectId}/cognition/${module}/extract`, { method: 'POST' }),
    )
  },
  // A1 兼容别名（= extractModule(projectId, 'brief')）
  async extractBrief(projectId: number): Promise<CognitionExtractOut> {
    return this.extractModule(projectId, 'brief')
  },
  async confirmCognition(projectId: number, cogId: number): Promise<ProjectCognition> {
    return ProjectCognitionSchema.parse(
      await request(`/api/projects/${projectId}/cognition/${cogId}/confirm`, { method: 'POST' }),
    )
  },
  async updateCognition(
    projectId: number,
    cogId: number,
    updates: Record<string, { value: unknown; status?: string }>,
  ): Promise<ProjectCognition> {
    return ProjectCognitionSchema.parse(
      await request(`/api/projects/${projectId}/cognition/${cogId}`, {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      }),
    )
  },
  // ── B 类跨项目复用库（阶段3）──
  async listCrossProjectTypes(): Promise<{ type: string; label: string; count: number }[]> {
    return z.array(CrossProjectTypeOutSchema).parse(await request('/api/cross-project/types'))
  },
  async listCrossProjectLibrary(
    crossType?: string,
  ): Promise<import('@/types/schemas').CrossProjectItemOut[]> {
    const qs = crossType ? `?cross_type=${encodeURIComponent(crossType)}` : ''
    return z.array(CrossProjectItemOutSchema).parse(await request(`/api/cross-project/library${qs}`))
  },
  async precipitateToCrossProject(
    projectId: number,
    cogId: number,
    crossType: string,
    title?: string,
  ): Promise<import('@/types/schemas').PrecipitateOut> {
    return PrecipitateOutSchema.parse(
      await request('/api/cross-project/precipitate', {
        method: 'POST',
        body: JSON.stringify({ project_id: projectId, cog_id: cogId, cross_type: crossType, title }),
      }),
    )
  },
  async searchKnowledge(query: string, topK = 5, projectId?: number, docType?: string): Promise<KnowledgeSearchOut> {
    /* P0(2026-07-08):projectId/docType 纯加法可选参——@项目名 在前端解析成 project_id,
       走后端现有 search 通路(禁双源);docType 命中层过滤。旧调用(两参)零感知。 */
    return KnowledgeSearchOutSchema.parse(
      await request('/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify({
          query,
          top_k: topK,
          ...(projectId != null ? { project_id: projectId } : {}),
          ...(docType ? { doc_type: docType } : {}),
        }),
      }),
    )
  },
  /** P0:资源管理器定位文件(打开所在位置)。404=文件缺失(带体检指引话术),由调用方如实呈现。 */
  async revealProjectFile(projectId: number, fileId: number): Promise<{ ok: boolean; mode: string; path: string }> {
    return request(`/api/projects/${projectId}/files/${fileId}/reveal`, { method: 'POST' })
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
  /** 执行安全清理：把候选文件移入隔离区(需 confirm=true)。永不删除,返回 quarantine 时间戳供 restore。 */
  async cleanupApply(
    relPaths: string[],
  ): Promise<{ ok: boolean; quarantine?: string; moved?: number; manifest?: { timestamp: string }; error?: string }> {
    return request('/api/workspace/cleanup/apply', {
      method: 'POST',
      body: JSON.stringify({ rel_paths: relPaths, confirm: true }),
    })
  },
  /** 一键撤销：按隔离区时间戳把文件还原回原位(v2红线 归档可逆)。 */
  async cleanupRestore(timestamp: string): Promise<{ ok: boolean; restored?: number; total?: number; error?: string }> {
    return request('/api/workspace/cleanup/restore', {
      method: 'POST',
      body: JSON.stringify({ timestamp }),
    })
  },

  // ── 检查点① 铁条2/3：staging 收料单 + ingest 入库 job ──
  /** 选取的绝对路径列表(文件/文件夹混合)→ 只读盘扫成收料单(分组/统计/去重标灰)。 */
  async staging(paths: string[]): Promise<StagingResult> {
    return request('/api/staging', { method: 'POST', body: JSON.stringify({ paths }) })
  },
  /** 启动入库 job(四段流水线:落盘/解析/入库索引/归档抽图)，返回 job_id;进度经 /api/ingest/{id}/stream 的 SSE 推。 */
  async ingestStart(paths: string[]): Promise<{ job_id: string }> {
    return request('/api/ingest', { method: 'POST', body: JSON.stringify({ paths }) })
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
  // ── 图片资产(从 PPT/PDF/Word 抽出的图,一等资产) ──
  async listAssets(projectId: number, status: 'active' | 'trashed' = 'active'): Promise<{ items: FileAsset[]; total: number }> {
    return request(`/api/projects/${projectId}/assets${status !== 'active' ? `?status=${status}` : ''}`)
  },
  // 跨项目资产(2026-07-09 bug2 根治):不受单项目作用域;每条带 project_id/project_name
  async listAllAssets(status: 'active' | 'trashed' = 'active'): Promise<{ items: FileAssetGlobal[]; total: number }> {
    return request(`/api/assets/all${status !== 'active' ? `?status=${status}` : ''}`)
  },
  // 改分类(asset_type)或软移除/恢复(status='trashed'|'active')——只改登记,不删图/源文件
  async updateAsset(projectId: number, assetId: number, body: { asset_type?: string; status?: string }): Promise<{ id: number; asset_type: string; status: string }> {
    return request(`/api/projects/${projectId}/assets/${assetId}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  /** 从某文件抽图为资产(幂等);上传后异步触发,不阻塞。 */
  async extractFileAssets(projectId: number, fileId: number): Promise<{ extracted: number; project_total: number }> {
    return request(`/api/projects/${projectId}/files/${fileId}/extract-assets`, { method: 'POST' })
  },
  assetThumbUrl(projectId: number, assetId: number): string {
    return `${BASE_URL}/api/projects/${projectId}/assets/${assetId}/thumb`
  },
  assetImageUrl(projectId: number, assetId: number): string {
    return `${BASE_URL}/api/projects/${projectId}/assets/${assetId}/image`
  },
  // ── 任务看板(P0-A:会议纪要确认后落成可追踪任务)──
  async listAssignments(projectId: number): Promise<{ items: TaskAssignment[]; total: number }> {
    return request(`/api/team/assignments?project_id=${projectId}`)
  },
  async updateAssignment(assignmentId: number, status: 'todo' | 'doing' | 'done'): Promise<TaskAssignment> {
    return request(`/api/team/assignments/${assignmentId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
  // ── 甲方画像库(P1-E:按甲方聚合项目 + 已确认认知)──
  async listClients(): Promise<{ items: { name: string; project_count: number }[]; total: number }> {
    return request('/api/clients')
  },
  async getClientPortrait(name: string): Promise<ClientPortrait> {
    return request(`/api/clients/${encodeURIComponent(name)}`)
  },
  // ── 方案评审预检(P1-D:成果提交前对照清单逐条预检)──
  async runReviewPrecheck(projectId: number, sourceResultId = 0, input = '', signal?: AbortSignal): Promise<ReviewPrecheck> {
    return request(`/api/projects/${projectId}/review-precheck`, {
      method: 'POST',
      body: JSON.stringify({ source_result_id: sourceResultId, input }),
      signal,
    })
  },
  // ── 任务安排成果一键落任务看板(幂等:同一成果重复落不重复建)──
  async taskResultToAssignments(
    projectId: number,
    resultId: number,
  ): Promise<{ status: string; created: number; existing: number; message: string }> {
    return request(`/api/projects/${projectId}/skill-results/${resultId}/to-assignments`, { method: 'POST' })
  },
  // ── MoA 方案评审「设计委员会」(设计总监/空间设计师/形式设计师三视角并发 + reasoner 聚合) ──
  async runMoaReview(projectId: number): Promise<MoaReviewResult> {
    return request(`/api/review-checklist/moa?project_id=${projectId}`, { method: 'POST' })
  },
  async getMoaReview(projectId: number): Promise<MoaReviewLatest> {
    return request(`/api/review-checklist/${projectId}`)
  },
  // ── 收件箱监听(P1-C:监听文件夹,新文件自动入库)──
  async inboxStatus(): Promise<{ inbox_root_path: string; accessible: boolean; pending: number }> {
    return request('/api/inbox/status')
  },
  async inboxConfig(path: string): Promise<{ inbox_root_path: string; accessible: boolean }> {
    return request('/api/inbox/config', { method: 'POST', body: JSON.stringify({ path }) })
  },
  async scanInbox(): Promise<{ accessible: boolean; scanned?: number; imported?: number; indexed?: number; skipped?: number; failed?: number; reason?: string }> {
    return request('/api/inbox/scan', { method: 'POST', body: '{}' })
  },
  /** 把现有【落在内部 uploads 的项目文件】整理进已配置的仓库 {仓库}/{项目名}/(存量迁移,幂等)。 */
  async organizeToRepository(): Promise<{
    projects_touched: number
    moved: number
    skipped: number
    missing: number
    failed: number
    repository: string
  }> {
    return request('/api/projects/repository/organize', { method: 'POST' })
  },
  /** 只读列目录:path 为空 → 盘符列表;否则该目录直接子级。供目录选择弹窗用。 */
  async listDir(path = ''): Promise<DirList> {
    return DirListSchema.parse(
      await request(`/api/filesystem/list-dir?path=${encodeURIComponent(path)}`),
    )
  },

  // ── 4D: AI 研判 ──
  async analyzeProject(projectId: number, task: string, opts: { force?: boolean; topK?: number } = {}): Promise<ProjectAnalysis> {
    return ProjectAnalysisSchema.parse(
      await request(`/api/projects/${projectId}/analyze`, {
        method: 'POST',
        body: JSON.stringify({ task, top_k: opts.topK ?? 5, force: opts.force ?? false }),
      }),
    )
  },
  async listProjectAnalyses(projectId: number) {
    return ProjectAnalysisListSchema.parse(
      await request(`/api/projects/${projectId}/analyses`),
    )
  },
  /** 每个 task 最新成功结果各一条(供进页面批量回填,点 tab 秒显不重跑)。 */
  async latestAnalyses(projectId: number) {
    return ProjectAnalysisListSchema.parse(
      await request(`/api/projects/${projectId}/analyses/latest`),
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
  /** 转写能力三态(依赖/模型/分离是否就绪)。 */
  async transcribeCapability(projectId: number) {
    return TranscribeCapabilitySchema.parse(
      await request(`/api/projects/${projectId}/transcribe/status`),
    )
  },
  /** 上传录音起异步转写 job(带上传进度)。返回 {job_id}。 */
  createMeetingFromAudio(
    projectId: number,
    file: File,
    meta: { title: string },
    onProgress?: (pct: number) => void,
  ): Promise<TranscribeJob> {
    return new Promise((resolve, reject) => {
      const form = new FormData()
      form.append('file', file)
      form.append('title', meta.title)
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/api/projects/${projectId}/meetings/from-audio`)
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(TranscribeJobSchema.parse(JSON.parse(xhr.responseText)))
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
  /** 轮询转写 job 状态(十态)。 */
  async transcribeJobStatus(projectId: number, jobId: string): Promise<TranscribeJob> {
    return TranscribeJobSchema.parse(
      await request(`/api/projects/${projectId}/transcribe/jobs/${jobId}`),
    )
  },
  /** 人工映射 speaker-1/2/3 → 真实角色(生成纪要前)。 */
  async updateSpeakerMap(
    projectId: number,
    meetingId: number,
    mapping: Record<string, string>,
  ): Promise<MeetingDetail> {
    return MeetingDetailSchema.parse(
      await request(`/api/projects/${projectId}/meetings/${meetingId}/speaker-map`, {
        method: 'POST',
        body: JSON.stringify({ mapping }),
      }),
    )
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
  async getLatestMinute(projectId: number, meetingId: number): Promise<MeetingMinute> {
    return MeetingMinuteSchema.parse(
      await request(`/api/projects/${projectId}/meetings/${meetingId}/minute`),
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
  async reflowMinute(
    projectId: number,
    meetingId: number,
    minuteId: number,
  ): Promise<Reflow> {
    return ReflowSchema.parse(
      await request(
        `/api/projects/${projectId}/meetings/${meetingId}/minute/${minuteId}/reflow`,
        { method: 'POST' },
      ),
    )
  },
  /** 共创营地"生成这份文件的会议纪要":用已上传项目文件原文 → 建会议 → 出正式纪要(进会议中心)。 */
  async minuteFromFile(projectId: number, fileId: number, title?: string): Promise<{
    meeting_id: number
    minute_id: number
    title: string
    gen_status: string
    markdown: string
    error: string
  }> {
    return request(`/api/projects/${projectId}/meetings/from-file`, {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, title }),
    })
  },
  /** Word 正式导出 URL（variant=external|internal）。 */
  minuteDocxUrl(projectId: number, meetingId: number, minuteId: number, variant: 'external' | 'internal' = 'external'): string {
    return `${BASE_URL}/api/projects/${projectId}/meetings/${meetingId}/minute/${minuteId}/export.docx?variant=${variant}`
  },
  /** 打印友好 HTML URL（前端新窗口打开后 window.print()）。 */
  minutePrintUrl(projectId: number, meetingId: number, minuteId: number, internal = false): string {
    return `${BASE_URL}/api/projects/${projectId}/meetings/${meetingId}/minute/${minuteId}/print${internal ? '?internal=true' : ''}`
  },
  /** 转写稿纯文本导出 URL（零 LLM,无需 key;bug3 解耦——转写稿是资产)。 */
  transcriptTxtUrl(projectId: number, meetingId: number): string {
    return `${BASE_URL}/api/projects/${projectId}/meetings/${meetingId}/transcript.txt`
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

export interface FileAsset {
  id: number
  source_file_id: number
  ext: string
  asset_type: string // render|reference|plan|model|material|logo|extracted|image
  status?: string
  page_no: number
  slide_no: number
  shape_index: number
  caption: string
  width: number
  height: number
}
// 跨项目资产:FileAsset + 项目归属(bug2 根治)
export interface FileAssetGlobal extends FileAsset {
  project_id: number
  project_name: string
}
export interface TaskAssignment {
  id: number
  project_id: number
  task_title: string
  owner_name: string
  member_id: number | null
  due: string
  status: 'todo' | 'doing' | 'done' | string
  source_minute_id: number
  source_result_id: number
  done_at: string | null
  created_at: string
}

// ── MoA 设计委员会（方案评审）──
export interface MoaChecklistItem {
  item: string
  pass: boolean
  note?: string
  severity?: string
  expert_source?: string
  design_impact?: string
  suggested_action?: string
}
export interface MoaCategory {
  category: string
  label: string
  items: MoaChecklistItem[]
}
export interface MoaConflict {
  issue: string
  // 设计版三视角（概念/空间/形式）
  concept_view?: string
  spatial_view?: string
  form_view?: string
  // 旧版兼容（功能/成本）
  function_view?: string
  cost_view?: string
  resolution?: string
}
export interface MoaHighlight {
  aspect: string
  note: string
}
export interface MoaCoreIssue {
  issue: string
  severity?: string
  impact?: string
  suggestion?: string
  expert_source?: string
}
export interface MoaChecklist {
  overall_score?: number
  risk_level?: string
  pass_rate?: number
  one_sentence_review?: string
  highlights?: MoaHighlight[]
  core_issues?: MoaCoreIssue[]
  categories?: MoaCategory[]
  conflict_items?: MoaConflict[]
  cross_cutting_issues?: MoaConflict[]
  next_steps?: string[]
  parse_error?: boolean
  raw_output?: string
}
export interface MoaReferenceDetail {
  role: string
  model: string
  status: string
  output: string
  latency_ms: number
  cost_yuan: number
}
export interface MoaReviewResult {
  success: boolean
  analysis_id?: number
  checklist?: MoaChecklist
  expert_summary?: string
  cost?: { total_tokens: number; total_cost_yuan: number; total_latency_ms: number }
  reference_details?: MoaReferenceDetail[]
  error?: string             // success=false 时:可读错误
  retry_suggestion?: string  // success=false 时:重试建议
}
export interface MoaReviewLatest {
  success: boolean
  analysis_id?: number
  created_at?: string
  checklist?: MoaChecklist  // 回查只还原最终评审结论;评图过程(专家原话)不持久化
  message?: string
}
export interface ClientPortrait {
  client: string
  project_count: number
  cities: string[]
  projects: {
    id: number
    name: string
    city: string
    status: string
    current_stage: string
    cognition: { module_label: string; summary: string }[]
  }[]
}
export interface ReviewPrecheckItem {
  id: string
  label: string
  dim: string
  status: string // pass|warn|fail|na
  finding: string
  evidence: string
}
export interface ReviewPrecheck {
  status: string // ok|not_configured|no_material|error
  items: ReviewPrecheckItem[]
  summary: { pass?: number; warn?: number; fail?: number; na?: number }
  content: string
  output_json: string
  source_result_id: number
  precheck_id: number
  model: string
  error_message: string
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

// ── staging 收料单（检查点① 铁条2）──
export interface StagingFile {
  abs_path: string
  name: string
  ext: string
  size: number
  supported: boolean
  already_indexed: boolean
}
export interface StagingGroup {
  source_dir: string
  project_hint: string
  project_id: number
  warn_reason?: string          // 名字软警示（编号前缀/通用词），前端标黄不拦
  files: StagingFile[]
}
export interface StagingResult {
  groups: StagingGroup[]
  total_files: number
  supported_files: number
  already_indexed: number
  type_stats: Record<string, number>
  skipped_unsupported: number
  selection_mode?: 'multi' | 'single'   // multi=父目录已拆成多项目
  loose_files?: number                   // 父目录直属散落文件数（本次不入库，提示不静默）
  error: string
}

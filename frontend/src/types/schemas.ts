import { z } from 'zod'

/** 与后端 schemas.py 对齐的运行时校验 schema。 */

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Project = z.infer<typeof ProjectSchema>

export const ProjectListSchema = z.object({
  items: z.array(ProjectSchema),
  total: z.number(),
})
export type ProjectList = z.infer<typeof ProjectListSchema>

export const ProjectOverviewSchema = z.object({
  files: z.number(),
  meetings: z.number(),
  todos: z.number(),
  minutes: z.number(),
  risks: z.number(),
  assets: z.number(),
  gaps: z.number(),
})
export type ProjectOverview = z.infer<typeof ProjectOverviewSchema>

export const ProjectMilestoneSchema = z.object({
  title: z.string(),
  owner: z.string(),
  due: z.string(),
  urgent: z.boolean(),
})
export type ProjectMilestone = z.infer<typeof ProjectMilestoneSchema>
export const ProjectMilestoneListSchema = z.object({ items: z.array(ProjectMilestoneSchema) })

export const ProjectRiskSchema = z.object({ level: z.string(), text: z.string() })
export type ProjectRisk = z.infer<typeof ProjectRiskSchema>
export const ProjectRiskListSchema = z.object({ items: z.array(ProjectRiskSchema) })

export const ReusableAssetSchema = z.object({ kind: z.string(), name: z.string() })
export type ReusableAsset = z.infer<typeof ReusableAssetSchema>
export const ReusableAssetListSchema = z.object({ items: z.array(ReusableAssetSchema) })

export const SkillSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string(),
  source: z.string(),
  example: z.string(),
  status: z.string(),
})
export type Skill = z.infer<typeof SkillSchema>

export const SkillListSchema = z.object({
  items: z.array(SkillSchema),
  total: z.number(),
})
export type SkillList = z.infer<typeof SkillListSchema>

// ── 协作平台 / 驾驶舱（C4/C5）──
export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  duty: z.string(),
  output: z.string(),
  status: z.string(),
})
export type Agent = z.infer<typeof AgentSchema>
export const AgentListSchema = z.object({ items: z.array(AgentSchema) })

export const TeamMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.string(),
  duty: z.string(),
  birthday: z.string(),
})
export type TeamMember = z.infer<typeof TeamMemberSchema>
export const TeamMemberListSchema = z.object({ items: z.array(TeamMemberSchema) })

export const TickerItemSchema = z.object({ kind: z.string(), text: z.string() })
export type TickerItem = z.infer<typeof TickerItemSchema>
export const TickerListSchema = z.object({ items: z.array(TickerItemSchema) })

export const BroadcastSchema = z.object({
  id: z.number(),
  text: z.string(),
  created_at: z.string(),
})
export type Broadcast = z.infer<typeof BroadcastSchema>
export const BroadcastListSchema = z.object({ items: z.array(BroadcastSchema) })

export const BossDashboardSchema = z.object({
  active_projects: z.number(),
  near_delivery: z.number(),
  high_risks: z.number(),
  ai_usage_week: z.number(),
})
export type BossDashboard = z.infer<typeof BossDashboardSchema>

export const WorkloadItemSchema = z.object({
  name: z.string(),
  pct: z.number(),
  level: z.string(),
})
export type WorkloadItem = z.infer<typeof WorkloadItemSchema>
export const WorkloadListSchema = z.object({ items: z.array(WorkloadItemSchema) })

export const AiUsageItemSchema = z.object({ capability: z.string(), count: z.number() })
export type AiUsageItem = z.infer<typeof AiUsageItemSchema>
export const AiUsageListSchema = z.object({ items: z.array(AiUsageItemSchema) })

export const NotConfiguredListSchema = z.object({
  status: z.string(),
  items: z.array(z.unknown()),
})

export const KnowledgeStatsSchema = z.object({
  documents: z.number(),
  indexed: z.number(),
  chunks: z.number(),
  cjk_chunks: z.number(),
  engine: z.string(),
})
export type KnowledgeStats = z.infer<typeof KnowledgeStatsSchema>

export const PROJECT_STATUSES = ['active', 'planning', 'completed'] as const

export const ProjectInputSchema = z.object({
  name: z.string().min(1, '项目名称不能为空').max(200, '名称过长'),
  description: z.string().max(1000, '描述过长').optional(),
  status: z.enum(PROJECT_STATUSES),
})
export type ProjectInput = z.infer<typeof ProjectInputSchema>

export const SettingsSchema = z.object({
  deepseek_api_key_set: z.boolean(),
  deepseek_base_url: z.string(),
  deepseek_model: z.string(),
  theme: z.string(),
})
export type Settings = z.infer<typeof SettingsSchema>

export const SettingsInputSchema = z.object({
  deepseek_api_key: z.string().optional(),
  deepseek_base_url: z.string().url('需为合法 URL').optional(),
  deepseek_model: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
})
export type SettingsInput = z.infer<typeof SettingsInputSchema>

// ── 4B: 聊天 ──
export const ChatSessionSchema = z.object({
  id: z.number(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type ChatSession = z.infer<typeof ChatSessionSchema>

export const ChatMessageSchema = z.object({
  id: z.number(),
  session_id: z.number(),
  role: z.string(),
  content: z.string(),
  status: z.string(),
  error_message: z.string(),
  created_at: z.string(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatSessionListSchema = z.object({
  items: z.array(ChatSessionSchema),
  total: z.number(),
})

export const ChatSessionDetailSchema = ChatSessionSchema.extend({
  messages: z.array(ChatMessageSchema),
})
export type ChatSessionDetail = z.infer<typeof ChatSessionDetailSchema>

export const KnowledgeHitSchema = z.object({
  document_id: z.number(),
  title: z.string(),
  snippet: z.string(),
  score: z.number(),
  matched_text: z.string(),
  engine: z.string(),
})
export type KnowledgeHit = z.infer<typeof KnowledgeHitSchema>

export const SendMessageOutSchema = z.object({
  user_message: ChatMessageSchema,
  assistant_message: ChatMessageSchema,
  knowledge_hits: z.array(KnowledgeHitSchema),
  model: z.string(),
  ai_configured: z.boolean(),
})
export type SendMessageOut = z.infer<typeof SendMessageOutSchema>

// ── 4B: 知识库 ──
export const KnowledgeDocSchema = z.object({
  id: z.number(),
  title: z.string(),
  source_path: z.string(),
  content_text: z.string(),
  file_type: z.string(),
  tags: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type KnowledgeDoc = z.infer<typeof KnowledgeDocSchema>

export const KnowledgeDocListItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  source_path: z.string(),
  file_type: z.string(),
  tags: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type KnowledgeDocListItem = z.infer<typeof KnowledgeDocListItemSchema>

export const KnowledgeDocListSchema = z.object({
  items: z.array(KnowledgeDocListItemSchema),
  total: z.number(),
})

export const KnowledgeSearchOutSchema = z.object({
  query: z.string(),
  engine: z.string(),
  hits: z.array(KnowledgeHitSchema),
})
export type KnowledgeSearchOut = z.infer<typeof KnowledgeSearchOutSchema>

// ── 4D: 项目文件 ──
export const ProjectFileSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  filename: z.string(),
  stored_path: z.string(),
  file_type: z.string(),
  size: z.number(),
  parse_status: z.string(), // pending|ok|empty|unsupported|failed
  parse_error: z.string(),
  indexed_doc_id: z.number(),
  status: z.string(), // active|trashed
  created_at: z.string(),
  updated_at: z.string(),
})
export type ProjectFile = z.infer<typeof ProjectFileSchema>

export const ProjectFileDetailSchema = ProjectFileSchema.extend({
  content_text: z.string(),
})
export type ProjectFileDetail = z.infer<typeof ProjectFileDetailSchema>

export const ProjectFileListSchema = z.object({
  items: z.array(ProjectFileSchema),
  total: z.number(),
})

export const IndexFileOutSchema = z.object({
  file_id: z.number(),
  document_id: z.number(),
  title: z.string(),
})

// ── 4D: AI 研判 ──
export const ANALYSIS_TASKS = [
  { key: 'overview', label: '项目总览分析' },
  { key: 'difficulty', label: '设计难点分析' },
  { key: 'demand', label: '甲方诉求分析' },
  { key: 'plan', label: '设计推进计划' },
  { key: 'report', label: '汇报提纲' },
] as const
export type AnalysisTaskKey = (typeof ANALYSIS_TASKS)[number]['key']

export const AnalysisSourceSchema = z.object({
  kind: z.string(), // knowledge|project_file
  ref_id: z.number(),
  title: z.string(),
  snippet: z.string(),
  engine: z.string(),
})
export type AnalysisSource = z.infer<typeof AnalysisSourceSchema>

export const ProjectAnalysisSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  task: z.string(),
  status: z.string(), // ok|not_configured|no_material|error
  content: z.string(),
  sources: z.array(AnalysisSourceSchema),
  model: z.string(),
  error_message: z.string(),
  created_at: z.string(),
})
export type ProjectAnalysis = z.infer<typeof ProjectAnalysisSchema>

export const ProjectAnalysisListSchema = z.object({
  items: z.array(ProjectAnalysisSchema),
  total: z.number(),
})

// ── 会议纪要 ──
export const MeetingSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  title: z.string(),
  meeting_date: z.string(),
  attendees: z.string().default(''),
  transcript_source: z.string(),
  status: z.string(),
  provider: z.string().default(''),
  tencent_meeting_code: z.string().default(''),
  tencent_join_url: z.string().default(''),
  tencent_start_time: z.string().default(''),
  tencent_end_time: z.string().default(''),
  tencent_status: z.string().default(''),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Meeting = z.infer<typeof MeetingSchema>

export const TranscriptSegmentSchema = z.object({
  text: z.string(),
  speaker_key: z.string(),
  start_ms: z.number(),
  end_ms: z.number(),
})

export const MeetingDetailSchema = MeetingSchema.extend({
  raw_text: z.string(),
  tencent_meeting_id: z.string().default(''),
  segments: z.array(TranscriptSegmentSchema),
})
export type MeetingDetail = z.infer<typeof MeetingDetailSchema>

export const TencentSyncSchema = z.object({
  status: z.string(),
  minutes: z.string().default(''),
  transcript: z.string().default(''),
  message: z.string().default(''),
})
export type TencentSync = z.infer<typeof TencentSyncSchema>

export const MeetingListSchema = z.object({
  items: z.array(MeetingSchema),
  total: z.number(),
})

export const DemandItemSchema = z.object({
  statement: z.string(),
  quote: z.string(),
  time: z.string(),
})
export const TodoItemSchema = z.object({
  text: z.string(),
  owner: z.string(),
  due: z.string(),
})

export const MeetingMinuteSchema = z.object({
  id: z.number(),
  meeting_id: z.number(),
  gen_status: z.string(), // ok|not_configured|no_material|error
  summary: z.array(z.string()),
  core_items: z.array(z.string()),
  demand_internal: z.array(DemandItemSchema),
  demand_external: z.array(DemandItemSchema),
  decisions: z.array(z.string()),
  todos: z.array(TodoItemSchema),
  review_status: z.string(), // draft|confirmed
  model: z.string(),
  error_message: z.string(),
  created_at: z.string(),
})
export type MeetingMinute = z.infer<typeof MeetingMinuteSchema>

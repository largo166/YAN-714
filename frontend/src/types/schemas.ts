import { z } from 'zod'

/** 与后端 schemas.py 对齐的运行时校验 schema。 */

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  status: z.string(),
  city: z.string().default(''),
  client: z.string().default(''),
  current_stage: z.string().default('brief'),
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

export const ProjectProgressSchema = z.object({
  pct: z.number(),
  next_node: z.string(),
  next_due: z.string(),
})
export type ProjectProgress = z.infer<typeof ProjectProgressSchema>

export const ResultSendChannelSchema = z.object({
  channel: z.string(),
  configured: z.boolean(),
  label: z.string(),
})
export type ResultSendChannel = z.infer<typeof ResultSendChannelSchema>
export const ResultSendChannelsSchema = z.object({ items: z.array(ResultSendChannelSchema) })

export const ResultSendPreviewSchema = z.object({
  status: z.string(),
  rendered: z.string().default(''),
  channel: z.string().default(''),
})
export type ResultSendPreview = z.infer<typeof ResultSendPreviewSchema>

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

export const SkillSourceSchema = z.object({
  kind: z.string(),
  ref_id: z.number(),
  title: z.string(),
  snippet: z.string(),
  engine: z.string().default(''),
})
export const SkillRunSchema = z.object({
  skill_id: z.string(),
  status: z.string(),
  title: z.string().default(''),
  content: z.string().default(''),
  sources: z.array(SkillSourceSchema).default([]),
  model: z.string().default(''),
  error_message: z.string().default(''),
})
export type SkillRun = z.infer<typeof SkillRunSchema>

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

export const AgentRunSchema = z.object({
  agent_id: z.string(),
  status: z.string(),
  title: z.string().default(''),
  content: z.string().default(''),
  sources: z.array(SkillSourceSchema).default([]),
  model: z.string().default(''),
  error_message: z.string().default(''),
})
export type AgentRun = z.infer<typeof AgentRunSchema>

export const TeamAssignmentSchema = z.object({
  task_title: z.string(),
  due: z.string().default(''),
  project_id: z.number(),
})
export type TeamAssignment = z.infer<typeof TeamAssignmentSchema>

export const TeamMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.string(),
  duty: z.string(),
  birthday: z.string(),
  assignments: z.array(TeamAssignmentSchema).default([]),
})
export type TeamMember = z.infer<typeof TeamMemberSchema>
export const TeamMemberListSchema = z.object({ items: z.array(TeamMemberSchema) })

export const ReflowSchema = z.object({
  status: z.string(),
  reflowed_count: z.number(),
})
export type Reflow = z.infer<typeof ReflowSchema>

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
  repository_root_path: z.string().default(''),
  repository_configured: z.boolean().default(false),
})
export type Settings = z.infer<typeof SettingsSchema>

export const SettingsInputSchema = z.object({
  deepseek_api_key: z.string().optional(),
  deepseek_base_url: z.string().url('需为合法 URL').optional(),
  deepseek_model: z.string().optional(),
  theme: z.enum(['light', 'dark']).optional(),
  repository_root_path: z.string().optional(),
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
  cognition_injected: z.boolean().default(false), // 本次是否注入了项目已确认结构化认知
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
  type: z.string().default(''),
  description: z.string().default(''),
  resource: z.string().default(''),
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
  type: z.string().default(''),
  description: z.string().default(''),
  resource: z.string().default(''),
  created_at: z.string(),
  updated_at: z.string(),
})
export type KnowledgeDocListItem = z.infer<typeof KnowledgeDocListItemSchema>

export const GenerateMetadataOutSchema = z.object({
  status: z.string(),
  document_id: z.number(),
  description: z.string().default(''),
  type: z.string().default(''),
  model: z.string().default(''),
  message: z.string().default(''),
  error_message: z.string().default(''),
})
export type GenerateMetadataOut = z.infer<typeof GenerateMetadataOutSchema>

// ── 项目结构化认知（ProjectCognition Schema 规格 v1.0）──
export const CognitionFieldSourceSchema = z.object({
  type: z.string().default('manual'),
  doc_ids: z.array(z.number()).default([]),
  based_on: z.array(z.string()).default([]),
  doc_location: z.string().default(''),
})
export const CognitionFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.string(),
  extractable: z.string(),
  value: z.unknown().nullable().default(null),
  status: z.string().default('draft'),       // draft|confirmed|empty
  source: CognitionFieldSourceSchema.default({ type: 'manual', doc_ids: [], based_on: [], doc_location: '' }),
  confidence: z.number().nullable().default(null),
  guide: z.string().default(''),
})
export type CognitionField = z.infer<typeof CognitionFieldSchema>

export const CognitionSourceSchema = z.object({
  kind: z.string(),
  ref_id: z.number(),
  title: z.string(),
  snippet: z.string(),
  engine: z.string().default(''),
})
export const ProjectCognitionSchema = z.object({
  id: z.number(),
  project_id: z.number(),
  module: z.string(),
  module_label: z.string().default(''),
  schema_version: z.string().default('1.0'),
  fields: z.array(CognitionFieldSchema).default([]),   // 字段记录数组
  summary_md: z.string().default(''),
  status: z.string(),
  module_status: z.string().default('draft'),          // draft|confirmed|partial|empty
  version: z.number().default(1),
  sources: z.array(CognitionSourceSchema).default([]),
  model: z.string().default(''),
  quality_warnings: z
    .array(z.object({ field: z.string(), level: z.string(), code: z.string(), message: z.string() }))
    .default([]), // 隐形质检层(阶段6)
  created_at: z.string(),
  updated_at: z.string(),
})
export type ProjectCognition = z.infer<typeof ProjectCognitionSchema>

export const CognitionExtractOutSchema = z.object({
  status: z.string(),
  cognition: ProjectCognitionSchema.nullable().default(null),
  message: z.string().default(''),
  error_message: z.string().default(''),
})
export type CognitionExtractOut = z.infer<typeof CognitionExtractOutSchema>

// ── B 类跨项目复用库（阶段3）──
export const CrossProjectTypeOutSchema = z.object({
  type: z.string(),
  label: z.string(),
  count: z.number().default(0),
})
export type CrossProjectTypeOut = z.infer<typeof CrossProjectTypeOutSchema>

export const CrossProjectItemOutSchema = z.object({
  document_id: z.number(),
  title: z.string(),
  cross_type: z.string(),
  label: z.string(),
  description: z.string().default(''),
  resource: z.string().default(''),
  snippet: z.string().default(''),
})
export type CrossProjectItemOut = z.infer<typeof CrossProjectItemOutSchema>

export const PrecipitateOutSchema = z.object({
  status: z.string(),
  item: CrossProjectItemOutSchema.nullable().default(null),
  message: z.string().default(''),
})
export type PrecipitateOut = z.infer<typeof PrecipitateOutSchema>

// ── 工作流状态机驱动（阶段4）──
export const StageNodeOutSchema = z.object({
  stage: z.string(),
  label: z.string(),
  cognition_module: z.string().default(''),
  kind: z.string().default('process'),
  upstream_required: z.array(z.string()).default([]),
  done: z.boolean().default(false),
})
export const StageSuggestionOutSchema = z.object({
  stage: z.string(),
  label: z.string(),
  cognition_module: z.string(),
  ready: z.boolean(),
  blocked_by: z.array(z.string()).default([]),
})
export const StageProgressOutSchema = z.object({
  project_id: z.number(),
  current_stage: z.string(),
  done_count: z.number(),
  total_cognition_stages: z.number(),
  nodes: z.array(StageNodeOutSchema).default([]),
  suggestions: z.array(StageSuggestionOutSchema).default([]),
})
export type StageProgressOut = z.infer<typeof StageProgressOutSchema>

// ── 回流契约（成果回写数据基地，阶段5）──
export const REFLOW_STATUS_VALUES = ['ok', 'already', 'not_confirmed', 'empty'] as const
export const ReflowResultOutSchema = z.object({
  status: z.enum(REFLOW_STATUS_VALUES).catch('ok'), // 未知值兜底,不让 parse 崩
  document_id: z.number().default(0),
  title: z.string().default(''),
  resource: z.string().default(''),
  message: z.string().default(''),
})
export type ReflowResultOut = z.infer<typeof ReflowResultOutSchema>




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
  parse_status: z.string(), // pending|ok|ok_truncated|metadata_only|extraction_timeout|empty|unsupported|failed
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

export const BatchIngestFileSchema = z.object({
  path: z.string(),
  size: z.number(),
  ext: z.string(),
})
export const BatchIngestProjectPreviewSchema = z.object({
  project_name: z.string(),
  path: z.string(),
  supported_count: z.number(),
  unsupported_count: z.number(),
  files: z.array(BatchIngestFileSchema),
  unsupported: z.array(BatchIngestFileSchema),
})
export const BatchIngestPreviewSchema = z.object({
  accessible: z.boolean(),
  root: z.string(),
  error: z.string().default(''),
  total_projects: z.number(),
  total_supported: z.number(),
  total_unsupported: z.number(),
  projects: z.array(BatchIngestProjectPreviewSchema),
})
export type BatchIngestPreview = z.infer<typeof BatchIngestPreviewSchema>

export const BatchIngestProjectImportSchema = z.object({
  project_id: z.number(),
  project_name: z.string(),
  copied: z.number(),
  indexed: z.number(),
  failed: z.number(),
  skipped_existing: z.number(),
})
export const BatchIngestImportSchema = z.object({
  status: z.string(),
  root: z.string(),
  total_projects: z.number(),
  copied: z.number(),
  indexed: z.number(),
  failed: z.number(),
  skipped_existing: z.number(),
  projects: z.array(BatchIngestProjectImportSchema),
})
export type BatchIngestImport = z.infer<typeof BatchIngestImportSchema>

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
  reflowed: z.boolean().default(false),
  model: z.string(),
  error_message: z.string(),
  created_at: z.string(),
})
export type MeetingMinute = z.infer<typeof MeetingMinuteSchema>

/* ═══ 数据桥 · 板块服务命名空间(海天五板的唯一取数入口) ═══
   单一数据事实:全部 re-export 自 @/lib/api(996 行既有封装,与紫黑同源),零复制零新管线。
   板块组件只 import 这里,不直接面对大 api 文件;后端契约变化只改 api.ts 一处。 */

import { api } from '@/lib/api'

/** b1 数据基地:统计/文档/搜索/接入三连/收件箱/清理五件套 */
export const knowledgeService = {
  stats: api.getKnowledgeStats,
  listDocs: api.listKnowledgeDocs,
  search: api.searchKnowledge,
  listDir: api.listDir,
  workspaceConfig: api.workspaceConfig,
  upload: api.uploadProjectFile,
  index: api.indexProjectFile,
  extractAssets: api.extractFileAssets,
  inboxStatus: api.inboxStatus,
  workspaceStatus: api.workspaceStatus,
  workspaceScan: api.workspaceScan,
  cleanupPreview: api.cleanupPreview,
  cleanupApply: api.cleanupApply,
  cleanupRestore: api.cleanupRestore,
}

/** b0 项目中心:总览/研判/里程碑/风险/进度/会议链 */
export const projectService = {
  overview: api.getProjectOverview,
  latestAnalyses: api.latestAnalyses,
  milestones: api.getProjectMilestones,
  risks: api.getProjectRisks,
  progress: api.getProjectProgress,
  listFiles: api.listProjectFiles,
  quickTencentMeeting: api.quickTencentMeeting,
  listMeetings: api.listMeetings,
  getLatestMinute: api.getLatestMinute,
  generateMinute: api.generateMinute,
  syncTencentMinutes: api.syncTencentMinutes,
  minuteDocxUrl: api.minuteDocxUrl,
  minutePrintUrl: api.minutePrintUrl,
}

/** b2 共创营地:技能域+特殊三件套+归档 */
export const campService = {
  listSkills: api.listSkills,
  runSkill: api.runSkill,
  searchKnowledge: api.searchKnowledge,
  listCognition: api.listCognition,
  querySlang: api.querySlang,
  listSkillResults: api.listSkillResults,
  projectImageUrl: api.projectImageUrl,
}

/** b3 协作平台:成员/甲方画像/智能体/通知 */
export const hubService = {
  listTeamMembers: api.listTeamMembers,
  createTeamMember: api.createTeamMember,
  updateTeamMember: api.updateTeamMember,
  deleteTeamMember: api.deleteTeamMember,
  listClients: api.listClients,
  getClientPortrait: api.getClientPortrait,
  listAgents: api.listAgents,
  listBroadcasts: api.listBroadcasts,
  getTicker: api.getTicker,
}

/** b4 驾驶舱:门禁/用量/工作量/广播/大盘 */
export const cockpitService = {
  adminStatus: api.adminStatus,
  adminSetup: api.adminSetup,
  adminLogin: api.adminLogin,
  getAiUsage: api.getAiUsage,
  getWorkload: api.getWorkload,
  getBossDashboard: api.getBossDashboard,
  listBroadcasts: api.listBroadcasts,
  createBroadcast: api.createBroadcast,
  listMilestones: api.getProjectMilestones,
  listMeetings: api.listMeetings,
  listProjects: api.listProjects,
}

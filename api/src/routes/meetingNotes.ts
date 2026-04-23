// Shim — 会议纪要采集渠道 REST routes
//
// 实体代码已迁入 modules/meeting-notes/ingest/routes.ts
// 本文件仅做 re-export，保持 server.ts 下 /api/v1/quality 旧 alias 继续工作。
// 计划 1 个版本后移除。

export { meetingNotesRoutes } from '../modules/meeting-notes/ingest/routes.js';
export type { MeetingNotesRouteOptions } from '../modules/meeting-notes/ingest/routes.js';

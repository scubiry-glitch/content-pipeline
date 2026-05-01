// CEO Module — pipeline adapter
// 注入 db + 三外部 engine 句柄 (meeting-notes / expert / content-library)
// 所有跨模块查询走 engine 接口，不直接 SQL 跨表

import type {
  CeoEngineDeps,
  DatabaseAdapter,
  MeetingNotesEngineHandle,
  ExpertEngineHandle,
  ContentLibraryEngineHandle,
} from '../types.js';

interface PipelineDepsInput {
  /** PostgreSQL query function (db/connection.ts query) */
  dbQuery: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  meetingNotesEngine?: MeetingNotesEngineHandle;
  expertEngine?: ExpertEngineHandle;
  contentLibraryEngine?: ContentLibraryEngineHandle;
}

export function createCeoPipelineDeps(input: PipelineDepsInput): CeoEngineDeps {
  const db: DatabaseAdapter = {
    query: (sql, params) => input.dbQuery(sql, params),
  };

  return {
    db,
    meetingNotes: input.meetingNotesEngine,
    expert: input.expertEngine,
    contentLibrary: input.contentLibraryEngine,
  };
}

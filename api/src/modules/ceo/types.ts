// CEO Module — 共享类型定义
// 跨模块仅以 source_module + source_id 弱引用 mn_*，不直接 SQL 跨表
// 三外部 engine 通过 deps 注入，房间聚合层走 engine 接口

// ============================================================
// Adapter 接口 (与 content-library 模式对齐)
// ============================================================

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

/** 跨模块 engine 句柄 — engine 接口透明，类型用 unknown 而非 any 强制 caller 谨慎使用 */
export interface MeetingNotesEngineHandle {
  /** 列某 scope 下的决策、风险、假设、开放问题、承诺等 (从 router.ts 现有路由暴露) */
  listScopeDecisions?(scopeId: string): Promise<unknown>;
  listScopeAssumptions?(scopeId: string): Promise<unknown>;
  listScopeRisks?(scopeId: string): Promise<unknown>;
  listScopeOpenQuestions?(scopeId: string): Promise<unknown>;
  listScopeCommitments?(scopeId: string): Promise<unknown>;
  listScopeJudgments?(scopeId: string): Promise<unknown>;
  /** 入队 LLM 任务（PR12 用）*/
  enqueue?(req: unknown): Promise<{ ok: boolean; runId?: string }>;
}

export interface ExpertEngineHandle {
  invoke?(req: unknown): Promise<unknown>;
}

export interface ContentLibraryEngineHandle {
  getOverviewStats?(): Promise<unknown>;
}

/** CeoEngine 注入的全部外部依赖 */
export interface CeoEngineDeps {
  db: DatabaseAdapter;
  meetingNotes?: MeetingNotesEngineHandle;
  expert?: ExpertEngineHandle;
  contentLibrary?: ContentLibraryEngineHandle;
}

// ============================================================
// 棱镜 / 房间核心类型
// ============================================================

export type PrismKind = 'direction' | 'board' | 'coord' | 'team' | 'ext' | 'self';

export interface Prism {
  id: string;
  scopeId: string | null;
  weekStart: string;            // ISO date YYYY-MM-DD
  alignment: number | null;     // direction
  boardScore: number | null;    // board
  coord: number | null;         // coord
  team: number | null;          // team
  ext: number | null;           // ext
  self: number | null;          // self
  computedAt: string;
}

export interface PrismWeight {
  userId: string;
  prism: PrismKind;
  targetPct: number;
  actualPct: number;
  weekStart: string;
}

// ============================================================
// 6 房间实体（PR4-PR9 各自填充字段）
// ============================================================

export interface StrategicLine {
  id: string;
  scopeId: string | null;
  name: string;
  kind: 'main' | 'branch' | 'drift';
  alignmentScore: number | null;
  status: 'active' | 'paused' | 'retired';
}

export interface DirectorConcern {
  id: string;
  directorId: string;
  topic: string;
  status: 'pending' | 'answered' | 'superseded';
  raisedCount: number;
  raisedAt: string;
}

export interface Stakeholder {
  id: string;
  scopeId: string | null;
  name: string;
  kind: 'customer' | 'regulator' | 'investor' | 'press' | 'partner' | 'employee' | 'other';
  heat: number;
  lastSignalAt: string | null;
}

export interface BalconyReflection {
  id: string;
  userId: string;
  weekStart: string;
  prismId: PrismKind | null;
  question: string;
  userAnswer: string | null;
  mood: string | null;
  answeredAt: string | null;
}

// ============================================================
// LLM Run 跨模块协议
// ============================================================

/** PR12 — CEO 模块往 mn_runs 入队的载荷类型 */
export interface CeoRunRequest {
  module: 'ceo';
  kind: 'briefing' | 'trend' | 'g3-expert-annotations' | 'g4-cross-meeting-rehash' | 'g2-rubric' | 'balcony-reflection';
  scopeId?: string | null;
  payload: Record<string, unknown>;
}

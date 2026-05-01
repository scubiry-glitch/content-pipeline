// Meeting Notes Module — Core Type Definitions
// 独立模块，零外部依赖，所有外部服务通过 Adapter 接口注入
// 参照 content-library / expert-library 的 Adapter + Engine + Router 模式

// ============================================================
// Adapter Interfaces (可插拔外部依赖)
// ============================================================

export interface DatabaseAdapter {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

export interface LLMAdapter {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
  completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string>;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  responseFormat?: 'text' | 'json';
  /** 流式生成进度回调，每收到 N 个 token 时触发；snippet 为最新输出的尾部片段（≤150字符） */
  onProgress?: (tokensSoFar: number, snippet: string) => void;
}

export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EventBusAdapter {
  publish(event: string, payload: any): Promise<void>;
  subscribe(event: string, handler: (payload: any) => Promise<void>): void;
  unsubscribe(event: string): void;
}

export interface TextSearchAdapter {
  search(query: string, options?: TextSearchOptions): Promise<TextSearchResult[]>;
  index(id: string, content: string, metadata?: Record<string, any>): Promise<void>;
}

export interface TextSearchOptions {
  limit?: number;
  offset?: number;
  filters?: Record<string, any>;
  minScore?: number;
}

export interface TextSearchResult {
  id: string;
  score: number;
  highlights?: string[];
  metadata?: Record<string, any>;
}

// ============================================================
// 外部模块句柄（来自 expert-library / expert-application / assets-ai）
// ============================================================

export interface ExpertInvokeRequest {
  expert_id: string;
  task_type: string;
  input_data: any;
  input_type?: string;
}

export interface ExpertInvokeResponse {
  output_sections: Record<string, any>;
  emm_gates_passed?: string[];
  confidence?: number;
  raw?: string;
}

export interface ExpertsAdapter {
  invoke(req: ExpertInvokeRequest): Promise<ExpertInvokeResponse>;
}

/** expert-application 在 api/src/services/expert-application 下实现；通过 adapter 注入本模块 */
export interface ExpertApplicationAdapter {
  resolveForMeetingKind(kind: string | null | undefined): ExpertStrategySpec | null;
  shouldSkipExpertAnalysis(kind: string | null | undefined): boolean;
}

export interface ExpertStrategySpec {
  preset: 'lite' | 'standard' | 'max';
  /** 形如 "decorator1|decorator2|base"，见 services/expert-application */
  default: string;
}

/** assets-ai 封薄：本模块只用到会议解析的几步 */
export interface AssetsAiAdapter {
  parseMeeting(assetId: string): Promise<ParsedMeeting>;
}

export interface ParsedMeeting {
  assetId: string;
  title?: string;
  transcript?: string;
  segments?: Array<{ speaker?: string; start?: number; end?: number; text: string }>;
  participants?: Array<{ name: string; role?: string }>;
  metadata?: Record<string, any>;
}

// ============================================================
// Engine 依赖聚合 + 配置
// ============================================================

export interface MeetingNotesDeps {
  db: DatabaseAdapter;
  llm: LLMAdapter;
  embedding: EmbeddingAdapter;
  experts: ExpertsAdapter;
  expertApplication: ExpertApplicationAdapter;
  assetsAi: AssetsAiAdapter;
  eventBus: EventBusAdapter;
  textSearch: TextSearchAdapter;
}

export interface MeetingNotesOptions {
  /** 是否启动内部 scheduler（独立部署时默认开） */
  enableScheduler?: boolean;
  /** run 队列并发上限 */
  runConcurrency?: number;
  /** library-level 重算默认 cron；null 禁用 */
  libraryRecomputeCron?: string | null;
}

export interface StandaloneConfig {
  port: number;
  dbConnectionString: string;
  llm: { provider: 'claude' | 'openai' | 'kimi'; apiKey: string };
  embedding?: { provider: 'claude' | 'openai'; apiKey: string };
  expertServiceUrl?: string;
  /** standalone 模式下若未接入真实 experts 服务，可关闭自动 run 触发 */
  disableAutoRun?: boolean;
}

// ============================================================
// 公共 DTO / 枚举
// ============================================================

export type ScopeKind = 'library' | 'project' | 'client' | 'topic' | 'meeting';

export type AxisName = 'people' | 'projects' | 'knowledge' | 'meta' | 'tension' | 'longitudinal' | 'all';

export type Preset = 'lite' | 'standard' | 'max';

export type RunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type RunTrigger = 'auto' | 'manual' | 'schedule' | 'cascade';

export interface ScopeRef {
  kind: ScopeKind;
  id?: string; // library 时为空
}

/** Run 生成模式：
 *  - 'multi-axis'（默认）：按 16 轴循环 LLM
 *  - 'claude-cli'：spawn 一次 claude -p（需装 claude 二进制 + 登录态）
 *  - 'api-oneshot'：与 claude-cli 同拓扑（一次出 16 轴 JSON），但走 Node 进程内 SDK 直连 LLM API
 *    （services/llm.ts 多 provider 路由：Claude / Kimi / OpenAI），无需 claude 二进制 */
export type RunMode = 'multi-axis' | 'claude-cli' | 'api-oneshot';

export interface EnqueueRunRequest {
  scope: ScopeRef;
  axis: AxisName;
  subDims?: string[];
  preset?: Preset;
  strategy?: string; // 覆盖 expertApplication.resolveForMeetingKind
  triggeredBy?: RunTrigger;
  parentRunId?: string | null;
  /**
   * Step 2 用户为不同会议纪要角色（people / projects / knowledge）指定的真实专家 id 列表。
   * 缺省则 dispatchPlan 退回硬编码的 3 位虚拟专家，axis computer 用通用提示词。
   * 给定时：dispatchPlan 按真实专家展开 expert slot；axis computer 在 LLM system prompt
   * 顶部注入这位/这些专家的 persona（风格 + 信条 + 口头禅 + 关注维度）。
   */
  expertRoles?: {
    people?: string[];
    projects?: string[];
    knowledge?: string[];
  };
  /**
   * 生成模式：
   * - 'multi-axis'（默认）：按 16 轴循环 LLM，跑现有 dispatchPlan + decorator 栈
   * - 'claude-cli'：spawn 一次 claude -p，整段 prompt 喂进去单次生成
   * - 'api-oneshot'：与 claude-cli 同拓扑（共用 buildFullPrompt + 同一份 16 轴 JSON schema），
   *   通道换成 services/llm.ts 直连 API（多 provider）。不需要装 claude 二进制 / 没有 session 概念
   *   三种模式都会走完 parseMeeting + 专家加载 + strategy 解析的共享上下文。
   */
  mode?: RunMode;
  /** 当前请求所在 workspace；不传时由 mn_runs 表的 DEFAULT (default ws) 兜底 */
  workspaceId?: string;
  /**
   * 改动三 (DAG)：可选 stage 标识。
   * - undefined（默认）：走老路径，不参与 DAG 校验，与历史完全兼容
   * - 'L1_meeting'：per-meeting 体征（meta + tension），由新会议入库自动触发
   * - 'L2_aggregate'：跨会聚合，需要等 dependsOn 的所有 run 全部 succeeded 后才会被 worker pickup
   * 'multi-axis' 模式 + 自动调度才会用 stage；'claude-cli'/'api-oneshot' 走 NULL 兼容路径
   */
  stage?: 'L1_meeting' | 'L2_aggregate';
  /** 必须 succeeded 的上游 run id 列表（仅 stage='L2_aggregate' 时生效） */
  dependsOn?: string[];
  /** 触发该 run 的 meeting id（L1 = 来源会议；L2 = fan-out 自哪场会议） */
  triggerMeetingId?: string;
}

export interface RunRecord {
  id: string;
  scope: ScopeRef;
  axis: AxisName;
  subDims: string[];
  preset: Preset;
  strategy: string | null;
  state: RunState;
  triggeredBy: RunTrigger;
  parentRunId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  costTokens: number;
  costMs: number;
  progressPct: number;
  errorMessage: string | null;
  metadata: Record<string, any>;
  // Phase 15.6 surfaces — incremental progress + token cost during execute
  tokens?: { input: number; output: number };
  currentStep?: string | null;
  /** Phase 15.8 — Step3 6 步化标记（ingest/segment/dispatch/dec/axes/synth/render） */
  currentStepKey?: string | null;
  llmCalls?: number;
  /** Phase 15.8 — 后端落库的 dispatchPlan / decorators / synthesis / render 镜像 */
  surfaces?: {
    dispatchPlan?: any;
    decorators?: any;
    synthesis?: any;
    render?: any;
    /** R5 · 粒度 1：per-axis 聚合统计（含 subDimStats per-sub_dim 计数） */
    axisStats?: Record<string, {
      durationMs?: number;
      llmCallsDelta?: number;
      inputTokensDelta?: number;
      outputTokensDelta?: number;
      subDimCount?: number;
      created?: number;
      updated?: number;
      skipped?: number;
      errors?: number;
      parseFailures?: number;
      subDimStats?: Record<string, {
        created: number;
        updated: number;
        skipped: number;
        errors: number;
        parseFailures: number;
        errorSamples?: Array<{ kind: string; message: string; excerpt?: string }>;
      }>;
    }>;
  };
}

export interface AxisVersionRef {
  id: string;
  runId: string;
  scope: ScopeRef;
  axis: AxisName;
  versionLabel: string;
  createdAt: string;
}

// ============================================================
// Events
// ============================================================

export const MEETING_NOTES_EVENTS = {
  ASSET_CREATED: 'mn.asset.created',
  MEETING_PARSED: 'mn.meeting.parsed',
  RUN_ENQUEUED: 'mn.run.enqueued',
  RUN_STARTED: 'mn.run.started',
  RUN_COMPLETED: 'mn.run.completed',
  RUN_FAILED: 'mn.run.failed',
  AXIS_VERSION_CREATED: 'mn.axis.version.created',
} as const;

export type MeetingNotesEvent = (typeof MEETING_NOTES_EVENTS)[keyof typeof MEETING_NOTES_EVENTS];

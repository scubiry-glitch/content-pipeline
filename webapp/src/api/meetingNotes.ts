// Meeting Notes API client — 薄封装 fetch 调用 /api/v1/meeting-notes/*
// 样式与既有 api/contentLibrary 类（实为直接 fetch）一致

const API_BASE = '/api/v1/meeting-notes';

// Fastify 4 默认对 Content-Type: application/json 的 DELETE / 空 POST 校验 body 非空，
// 否则抛 FST_ERR_CTP_EMPTY_JSON_BODY (400)。所以无 body 时只发 X-API-Key，不带 Content-Type。
const authHeader = () => ({
  'X-API-Key': (import.meta as any).env?.VITE_API_KEY || 'dev-api-key',
});
const jsonHeaders = () => ({
  ...authHeader(),
  'Content-Type': 'application/json',
});

/**
 * 把响应体附到 Error.message + 暴露 code，让调用方能 parse 后端的 4xx code 字段。
 * 不破坏现有 catch (e) { e.message }，只是 message 更长 / 多了 (e as any).code。
 */
async function throwHttpError(method: string, path: string, r: Response): Promise<never> {
  let bodyText = '';
  let bodyJson: any = null;
  try {
    bodyText = await r.text();
    if (bodyText) bodyJson = JSON.parse(bodyText);
  } catch { /* not JSON */ }
  const code = bodyJson?.code as string | undefined;
  const msg = bodyJson?.message as string | undefined;
  const summary = msg ?? bodyText ?? r.statusText;
  const err = new Error(`${method} ${path} → ${r.status}${code ? ` [${code}]` : ''}: ${summary}`);
  (err as any).status = r.status;
  (err as any).code = code;
  (err as any).body = bodyJson ?? bodyText;
  throw err;
}

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeader() });
  if (!r.ok) await throwHttpError('GET', path, r);
  return r.json();
}

async function jpost<T>(path: string, body?: any): Promise<T> {
  const hasBody = body !== undefined && body !== null;
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: hasBody ? jsonHeaders() : authHeader(),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) await throwHttpError('POST', path, r);
  return r.json();
}

async function jdelete<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: authHeader() });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
  return r.json();
}

async function jput<T>(path: string, body?: any): Promise<T> {
  const hasBody = body !== undefined && body !== null;
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: hasBody ? jsonHeaders() : authHeader(),
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status}`);
  return r.json();
}

// ========== Parse / Axes ==========

export const meetingNotesApi = {
  // Meeting-level
  parseMeeting: (assetId: string) => jpost<any>('/ingest/parse', { assetId }),
  /** 列最近 meetings（assets WHERE type='meeting_note' OR metadata?'meeting_kind'），含 title / meeting_kind / last_run / scope_bindings */
  listMeetings: (q: { limit?: number; status?: 'active' | 'archived' | 'all' } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
        if (v !== undefined && String(v) !== '') acc[k] = String(v);
        return acc;
      }, {}),
    ).toString();
    return jget<any>(`/meetings${qs ? '?' + qs : ''}`);
  },
  getMeetingAxes: (id: string) => jget<any>(`/meetings/${id}/axes`),
  getMeetingDetail: (id: string, view: 'A' | 'B' | 'C' = 'A') =>
    jget<any>(`/meetings/${id}/detail?view=${view}`),

  // Compute / Runs
  computeAxis: (body: { meetingId?: string; scope?: any; axis: string; subDims?: string[]; replaceExisting?: boolean }) =>
    jpost<any>('/compute/axis', body),

  /**
   * 跨轴线索：当前 axis 上的问题在其他 axis 的真实映射（基于 mn_*.row 实算）。
   * 替换 _axisShared.tsx 写死的 mock。返回空 items 时前端显示"本会议无跨轴线索"。
   */
  getCrossAxisClues: (id: string, axis: 'people' | 'projects' | 'knowledge' | 'meta') =>
    jget<{
      items: Array<{
        targetAxis: string;
        label: string;
        detail: string;
        count: number;
        to: string;
        anchor?: { kind: string; ids: string[] };
      }>;
    }>(`/meetings/${id}/cross-axis-clues?axis=${axis}`),

  /**
   * 跨 mn_*.text 字段的全文搜索（含转写 metadata.parse_segments 兜底）。
   * 用途：会议中被称呼但非发言人的角色（张总/刘总等）追踪，或任意关键词原文搜索。
   * snippet 是 keyword 前后 ~80 字的上下文。
   */
  grepMeeting: (id: string, q: string, limit = 50) =>
    jget<{
      items: Array<{
        axis: string;
        table: string;
        id: string;
        kind?: string;
        snippet: string;
        person_id?: string;
        person_name?: string;
      }>;
      q: string;
      totalLimit: number;
    }>(`/meetings/${id}/grep?q=${encodeURIComponent(q)}&limit=${limit}`),

  /**
   * scope 级 cross-axis-clues：聚合该 scope 下所有 meeting。
   * 用于 /meeting/axes/* 这种 axis 聚合页（不绑特定 meeting）。
   * scopeId 缺省时跨全库。
   */
  getCrossAxisCluesByScope: (params: { axis: 'people' | 'projects' | 'knowledge' | 'meta'; scopeKind?: string; scopeId?: string }) => {
    const qs = new URLSearchParams();
    qs.set('axis', params.axis);
    if (params.scopeKind) qs.set('scopeKind', params.scopeKind);
    if (params.scopeId) qs.set('scopeId', params.scopeId);
    return jget<{
      items: Array<{
        targetAxis: string;
        label: string;
        detail: string;
        count: number;
        to: string;
        anchor?: { kind: string; ids: string[] };
      }>;
    }>(`/cross-axis-clues?${qs.toString()}`);
  },

  enqueueRun: (body: {
    scope: any;
    axis: string;
    subDims?: string[];
    preset?: string;
    strategy?: string;
    triggeredBy?: string;
    /**
     * Step 2 用户为不同会议纪要角色指定的真实专家 id 列表。
     * 后端 dispatchPlan 会按真实专家展开 expert slot，axis computer 在 LLM
     * system prompt 顶部注入这位/这些专家的 persona。
     */
    expertRoles?: { people?: string[]; projects?: string[]; knowledge?: string[] };
    /**
     * 生成模式：
     * - 'multi-axis'（默认）：原 16 轴 LLM 循环
     * - 'claude-cli'：spawn 一次 claude -p，prompt 里把转写 + schema + 专家 personas + 装饰指令一起喂进去
     * - 'api-oneshot'：与 'claude-cli' 同拓扑（一次出 16 轴 JSON），但走 Node 进程内 SDK 直连 LLM API
     *   （services/llm.ts 多 provider 路由），无需 claude 二进制 / 没有 session 概念
     */
    mode?: 'multi-axis' | 'claude-cli' | 'api-oneshot';
  }) => {
    // 后端 router L605 要求 scope.kind 全小写 ['library','project','client','topic','meeting']
    // 多个调用点历史上传 'MEETING'/'PROJECT' 会触发 400 · 这里统一 normalize
    const scope = body.scope && typeof body.scope === 'object' && 'kind' in body.scope
      ? { ...body.scope, kind: typeof body.scope.kind === 'string' ? body.scope.kind.toLowerCase() : body.scope.kind }
      : body.scope;
    return jpost<{ ok: boolean; runId?: string; reason?: string }>('/runs', { ...body, scope });
  },
  listRuns: (q: { scopeKind?: string; scopeId?: string; axis?: string; state?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
      if (v !== undefined) acc[k] = String(v);
      return acc;
    }, {})).toString();
    return jget<{ items: any[] }>(`/runs${qs ? '?' + qs : ''}`);
  },
  getRun: async (id: string) => {
    const run = await jget<any>(`/runs/${id}`);
    return {
      ...run,
      // Backward compatibility: frontend polling reads `progress` / `error`,
      // while backend returns `progressPct` / `errorMessage`.
      progress: run?.progress ?? run?.progressPct ?? 0,
      error: run?.error ?? run?.errorMessage ?? null,
    };
  },
  cancelRun: (id: string) => jpost<{ success?: boolean }>(`/runs/${id}/cancel`),

  // Versions
  listVersions: (scopeKind: string, axis: string, scopeId?: string, limit = 20) => {
    const qs = scopeId ? `?scopeId=${encodeURIComponent(scopeId)}&limit=${limit}` : `?limit=${limit}`;
    return jget<{ items: any[] }>(`/versions/${scopeKind}/${axis}${qs}`);
  },
  diffVersions: (a: string, b: string) => jget<any>(`/versions/${a}/diff?vs=${b}`),

  /**
   * 主动写一份 axis 快照（"临时版本/备份"）。
   * AxisRegeneratePanel 在弹危险确认弹窗时调用，用户输入"重算"+勾选确认前先把现有数据备份成 vN。
   * 后端会写一行 mn_runs（triggered_by='manual', metadata.kind='manual_snapshot'）作为 FK 锚点，
   * 然后 versionStore.snapshot 自动算 vN + diff_vs_prev 入 mn_axis_versions。
   */
  createVersion: (body: { scopeKind: string; scopeId: string | null; axis: string; label?: string }) =>
    jpost<{
      versionId: string;
      versionLabel: string;
      prevVersionId: string | null;
      diff: { added: string[]; changed: string[]; removed: string[] };
      runId: string;
      sizeBytes: number;
      meetingCount: number;
      warning?: string;
    }>('/versions', body),

  // F12 · scope 级角色演化（多场会议漂移）
  getScopeRoleTrajectory: (scopeId: string) =>
    jget<{
      items: Array<{
        person_id: string;
        canonical_name: string;
        role: string | null;
        org: string | null;
        points: Array<{
          meeting_id: string;
          meeting_title: string;
          occurred_at: string;
          role_label: string;
          confidence: number;
        }>;
      }>;
    }>(`/scopes/${scopeId}/role-trajectory`),

  // F11 · 人物管理（改名 + alias 历史映射）
  listScopePeople: (scopeId: string) =>
    jget<{
      items: Array<{
        id: string;
        canonical_name: string;
        aliases: string[];
        role: string | null;
        org: string | null;
        commitment_count: number;
        created_at: string;
        updated_at: string;
      }>;
    }>(`/scopes/${scopeId}/people`),

  getPerson: (id: string) =>
    jget<{ id: string; canonical_name: string; aliases: string[]; role: string | null; org: string | null }>(`/people/${id}`),

  /**
   * 合并两个人物：把 fromId 合并到 :id（target 胜出）。
   * 11 张引用表 person_id reassign，source 的 canonical+aliases 并入 target.aliases，
   * 最后 DELETE source 行。整个操作 atomic（plpgsql 函数体隐式 transactional）。
   * dryRun=true 只返回引用计数 + 预览合并后的 aliases。
   */
  mergePeople: (targetId: string, body: { fromId: string; dryRun?: boolean }) =>
    jpost<
      | {
          dryRun: true;
          target: { id: string; canonical_name: string };
          source: { id: string; canonical_name: string };
          refs: Array<{ t: string; n: number }>;
          previewMergedAliases: string[];
        }
      | {
          ok: true;
          target: { id: string; canonical_name: string; aliases: string[]; updated_at: string };
          source: { id: string; canonical_name: string; deleted: true };
          affected: Array<{ table_name: string; rows_reassigned: number; rows_dropped: number }>;
        }
    >(`/people/${targetId}/merge`, body),

  /**
   * 改名：旧 canonical_name 自动入 aliases[]，让 LLM 抽取里出现旧名仍能 dedup 到同一行。
   * 冲突响应：409 CANONICAL_NAME_CONFLICT（同 (canonical_name, org) 已被另一人占用）。
   */
  renamePerson: (id: string, body: { canonical_name: string; role?: string; org?: string }) =>
    jput<{
      id: string;
      canonical_name: string;
      aliases: string[];
      role: string | null;
      org: string | null;
      changed: boolean;
      previousName?: string;
    }>(`/people/${id}`, body),

  /**
   * 把指定 mn_axis_version 反写回 mn_*。仅对 source 为 llm_extracted/restored 的行覆盖；
   * manual_import / human_edit 的行保留不动。dryRun=true 只返回 affected 计数不真改。
   */
  restoreVersion: (versionId: string, body: { dryRun?: boolean } = {}) =>
    jpost<{
      fromVersion: { id: string; label: string; axis: string; scopeKind: string; scopeId: string | null };
      dryRun: boolean;
      affected: Record<string, Record<string, { deleted: number; inserted: number; skipped: number }>>;
      newRunId?: string;
      newVersionId?: string;
      newVersionLabel?: string;
    }>(`/versions/${versionId}/restore`, body),

  // Scopes
  listScopes: (q: { kind?: string; status?: string } = {}) => {
    const qs = new URLSearchParams(q as any).toString();
    return jget<{ items: any[] }>(`/scopes${qs ? '?' + qs : ''}`);
  },
  getScope: (id: string) => jget<any>(`/scopes/${id}`),
  createScope: (body: any) => jpost<any>('/scopes', body),
  updateScope: (id: string, body: { name?: string; status?: 'active' | 'archived'; description?: string; stewardPersonIds?: string[]; metadata?: Record<string, unknown> }) =>
    jput<any>(`/scopes/${id}`, body),
  deleteScope: (id: string) => jdelete<{ success: boolean }>(`/scopes/${id}`),
  bindMeeting: (scopeId: string, meetingId: string, reason?: string) =>
    jpost<any>(`/scopes/${scopeId}/bindings`, { meetingId, reason }),
  listScopeMeetings: (scopeId: string) => jget<{ meetingIds: string[] }>(`/scopes/${scopeId}/meetings`),

  // Crosslinks
  listCrossLinks: (axis: string, itemId: string, scopeId?: string) => {
    const qs = new URLSearchParams({ axis, itemId, ...(scopeId ? { scopeId } : {}) }).toString();
    return jget<{ items: any[] }>(`/crosslinks?${qs}`);
  },

  // Longitudinal
  getLongitudinal: (scopeId: string, kind: 'belief_drift' | 'decision_tree' | 'model_hit_rate') =>
    jget<any>(`/scopes/${scopeId}/longitudinal/${kind}`),

  // Meetings
  listMeetings: (q: { limit?: number; status?: 'active' | 'archived' | 'all' } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') acc[k] = String(v);
        return acc;
      }, {}),
    ).toString();
    return jget<{ items: any[]; libraryRuns: any[] }>(`/meetings${qs ? '?' + qs : ''}`);
  },
  createMeeting: (body: { title?: string; meetingKind?: string }) =>
    jpost<{ id: string; title: string; created_at: string }>('/meetings', body),
  updateMeeting: (id: string, body: { title: string }) =>
    jput<{ id: string; title: string; created_at: string; updated_at: string }>(`/meetings/${id}`, body),
  archiveMeeting: (id: string) =>
    jpost<{ id: string; title: string; archived: boolean }>(`/meetings/${id}/archive`),
  unarchiveMeeting: (id: string) =>
    jpost<{ id: string; title: string; archived: boolean }>(`/meetings/${id}/unarchive`),
  deleteMeeting: (id: string) =>
    jdelete<{ ok: boolean }>(`/meetings/${id}`),
  unbindScope: (scopeId: string, meetingId: string) =>
    jdelete<{ success: boolean }>(`/scopes/${scopeId}/bindings/${meetingId}`),

  // Scope expert config（Phase 14 · 后端 #19 · 未上线时前端自动降级）
  getScopeConfig: (scopeId: string) => jget<{ scopeId: string; kind: string; preset: string; strategies: string[]; decorators: string[]; updatedAt?: string } | null>(`/scopes/${scopeId}/expert-config`),
  saveScopeConfig: (scopeId: string, body: { kind: string; preset: string; strategies?: string[]; decorators?: string[] }) =>
    jput<{ ok: boolean }>(`/scopes/${scopeId}/expert-config`, body),

  // Phase 15.1 · Speech metrics (#6 · 新路由 · 无破坏性)
  getSpeechMetrics: (meetingId: string) =>
    jget<{ items: Array<{ personId: string; entropy: number; followedUp: number; qaRatio?: number; termDensity?: number }> } | null>(
      `/meetings/${meetingId}/speech-metrics`,
    ),

  // Phase 15.2 · Decision quality (#14 · 新路由 · 无破坏性)
  getDecisionQuality: (meetingId: string) =>
    jget<{ overall: number; dims: Array<{ id: string; label: string; score: number; note?: string }>; teamAvg?: number } | null>(
      `/meetings/${meetingId}/decision-quality`,
    ),

  // Phase 15.5 · Structured diff (可能破坏性 · 走 ?structured=1 开关)
  diffVersionsStructured: (a: string, b: string) =>
    jget<{ added: any[]; removed: any[]; changed: Array<{ path: string; before: unknown; after: unknown }> } | null>(
      `/versions/${a}/diff?vs=${b}&structured=1`,
    ),

  // Phase 15.11 · AxisMeta · Necessity audit
  getMeetingNecessityAudit: (meetingId: string) =>
    jget<{ meeting_id: string; verdict: string; suggested_duration_min?: number; reasons: Array<{ k: string; t: string; ratio?: number }>; computed_at: string } | null>(
      `/meetings/${meetingId}/necessity-audit`,
    ),

  // Phase 15.12 · AxisPeople · Silence
  getMeetingSilence: (meetingId: string, q: { personId?: string } = {}) => {
    const qs = new URLSearchParams(q as any).toString();
    return jget<{ items: Array<{ id: string; person_id: string; person_name?: string; topic_id: string; state: 'spoke' | 'normal_silence' | 'abnormal_silence' | 'absent'; prior_topics_spoken: number; anomaly_score: number; computed_at: string }> }>(
      `/meetings/${meetingId}/silence${qs ? '?' + qs : ''}`,
    );
  },

  // Phase 15.13 · AxisKnowledge · Biases
  getMeetingBiases: (meetingId: string) =>
    jget<{ items: Array<{ id: string; bias_type: string; where_excerpt?: string; by_person_id?: string; by_person_name?: string; severity: 'low' | 'med' | 'high'; mitigated: boolean; mitigation_strategy?: string; created_at: string }> }>(
      `/meetings/${meetingId}/biases`,
    ),

  // Phase 15.14 · AxisMeta · Emotion curve
  getMeetingEmotionCurve: (meetingId: string) =>
    jget<{ meeting_id: string; samples: Array<{ t_sec: number; valence: number; intensity: number; tag?: string }>; tension_peaks: unknown[]; insight_points: unknown[]; computed_at: string } | null>(
      `/meetings/${meetingId}/emotion-curve`,
    ),

  // Phase 15.10 · AxisKnowledge · Judgments + Mental Models
  listScopeJudgments: (scopeId: string) =>
    jget<{ items: Array<{ id: string; text: string; abstracted_from_meeting_id: string; author_person_id?: string; author_name?: string; domain?: string; generality_score: number; reuse_count: number; linked_meeting_ids: string[]; created_at: string }> }>(
      `/scopes/${scopeId}/judgments`,
    ),
  getScopeMentalModelHitRate: (scopeId: string) =>
    jget<{ items: Array<{ id: string; model_name: string; invocations: number; hits: number; hit_rate: number; trend_30d?: number; flag: string; computed_at: string }> }>(
      `/scopes/${scopeId}/mental-models/hit-rate`,
    ),

  // Phase 15.9 · AxisPeople Commitments
  listScopeCommitments: (scopeId: string, q: { personId?: string; state?: string } = {}) => {
    const qs = new URLSearchParams(q as any).toString();
    return jget<{ items: Array<{ id: string; meeting_id: string; person_id: string; person_name?: string; text: string; due_at?: string; state: string; progress: number; created_at: string }> }>(
      `/scopes/${scopeId}/commitments${qs ? '?' + qs : ''}`,
    );
  },

  // Phase 15.8 · AxisProjects 数据源（全新路由族 · 无破坏性）
  listScopeDecisions: (scopeId: string) =>
    jget<{ items: Array<{ id: string; meeting_id: string; title: string; proposer_person_id?: string; proposer_name?: string; based_on_ids: string[]; superseded_by_id?: string; confidence: number; is_current: boolean; rationale?: string; created_at: string }> }>(
      `/scopes/${scopeId}/decisions`,
    ),
  listScopeAssumptions: (scopeId: string) =>
    jget<{ items: Array<{ id: string; meeting_id: string; text: string; evidence_grade: string; verification_state: string; verifier_person_id?: string; verifier_name?: string; due_at?: string; underpins_decision_ids: string[]; confidence: number; created_at: string }> }>(
      `/scopes/${scopeId}/assumptions`,
    ),
  listScopeOpenQuestions: (scopeId: string, q: { status?: string; category?: string } = {}) => {
    const qs = new URLSearchParams(q as any).toString();
    return jget<{ items: Array<{ id: string; text: string; category: string; status: string; times_raised: number; first_raised_meeting_id?: string; last_raised_meeting_id?: string; owner_person_id?: string; owner_name?: string; due_at?: string; created_at: string }> }>(
      `/scopes/${scopeId}/open-questions${qs ? '?' + qs : ''}`,
    );
  },
  listScopeRisks: (scopeId: string) =>
    jget<{ items: Array<{ id: string; text: string; severity: string; mention_count: number; heat_score: number; trend: string; action_taken: boolean; created_at: string }> }>(
      `/scopes/${scopeId}/risks`,
    ),
  getScopeProvenance: (scopeId: string, decisionId: string, depth?: number) => {
    const qs = new URLSearchParams({ decisionId, ...(depth ? { depth: String(depth) } : {}) }).toString();
    return jget<{ decisionId: string; chain: Array<{ id: string; title: string; meeting_id: string; based_on_ids: string[]; proposer_person_id?: string; confidence: number; created_at: string; depth: number }> }>(
      `/scopes/${scopeId}/provenance?${qs}`,
    );
  },

  // Phase 15.7 · Schedule CRUD (#20 · 全新路由族)
  listSchedules: (q: { scopeId?: string; scopeKind?: string; axis?: string } = {}) => {
    const qs = new URLSearchParams(q as any).toString();
    return jget<{ items: Array<{ id: string; name: string; cron?: string; target?: string; next?: string; on: boolean; scopeKind?: string; axis?: string; preset?: string }> }>(
      `/schedules${qs ? '?' + qs : ''}`,
    );
  },
  createSchedule: (body: { name: string; cron?: string; scopeKind?: string; scopeId?: string; axis?: string; preset?: string; on?: boolean }) =>
    jpost<{ id: string; ok: boolean }>('/schedules', body),
  updateSchedule: (id: string, body: Partial<{ name: string; cron: string; scopeKind: string; scopeId: string; axis: string; preset: string; on: boolean }>) =>
    jput<{ ok: boolean }>(`/schedules/${id}`, body),
  deleteSchedule: (id: string) =>
    jdelete<{ ok: boolean }>(`/schedules/${id}`),

  // Phase 15.15 · C.1 · Tension classification
  getMeetingTensions: (id: string) =>
    jget<{ items: Array<{ id: string; tension_key: string; between_ids: string[]; topic: string; intensity: number; summary: string; moments: Array<{ who: string; text: string }> }> }>(`/meetings/${id}/tensions`),

  // Sources (ingest)
  listSources: () => jget<{ items: any[] }>('/sources'),
  createSource: (body: {
    name: string;
    kind: 'lark' | 'zoom' | 'teams' | 'upload' | 'folder' | 'manual';
    config?: Record<string, unknown>;
    isActive?: boolean;
    scheduleCron?: string | null;
    createdBy?: string;
  }) => jpost<any>('/sources', body),
  getSourceHistory: (q: { sourceId?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
        if (v !== undefined && v !== null && String(v) !== '') acc[k] = String(v);
        return acc;
      }, {}),
    ).toString();
    return jget<{ items: any[] }>(`/sources/history${qs ? `?${qs}` : ''}`);
  },
  triggerSourceImport: (id: string, triggeredBy?: string) =>
    jpost<any>('/sources/import', { id, triggeredBy }),
  uploadToSource: async (sourceId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`${API_BASE}/sources/${sourceId}/upload`, {
      method: 'POST',
      headers: { 'X-API-Key': (import.meta as any).env?.VITE_API_KEY || 'dev-api-key' },
      body: fd,
    });
    if (!r.ok) throw new Error(`upload → ${r.status}`);
    return r.json();
  },
};

export { API_BASE as MEETING_NOTES_API_BASE };

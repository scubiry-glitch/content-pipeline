// Meeting Notes API client — 薄封装 fetch 调用 /api/v1/meeting-notes/*
// 样式与既有 api/contentLibrary 类（实为直接 fetch）一致

const API_BASE = '/api/v1/meeting-notes';

const headers = () => ({
  'Content-Type': 'application/json',
  'X-API-Key': (import.meta as any).env?.VITE_API_KEY || 'dev-api-key',
});

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function jpost<T>(path: string, body?: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}`);
  return r.json();
}

async function jdelete<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: headers() });
  if (!r.ok) throw new Error(`DELETE ${path} → ${r.status}`);
  return r.json();
}

async function jput<T>(path: string, body?: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status}`);
  return r.json();
}

// ========== Parse / Axes ==========

export const meetingNotesApi = {
  // Meeting-level
  parseMeeting: (assetId: string) => jpost<any>('/ingest/parse', { assetId }),
  getMeetingAxes: (id: string) => jget<any>(`/meetings/${id}/axes`),
  getMeetingDetail: (id: string, view: 'A' | 'B' | 'C' = 'A') =>
    jget<any>(`/meetings/${id}/detail?view=${view}`),

  // Compute / Runs
  computeAxis: (body: { meetingId?: string; scope?: any; axis: string; subDims?: string[]; replaceExisting?: boolean }) =>
    jpost<any>('/compute/axis', body),

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

  // Scopes
  listScopes: (q: { kind?: string; status?: string } = {}) => {
    const qs = new URLSearchParams(q as any).toString();
    return jget<{ items: any[] }>(`/scopes${qs ? '?' + qs : ''}`);
  },
  getScope: (id: string) => jget<any>(`/scopes/${id}`),
  createScope: (body: any) => jpost<any>('/scopes', body),
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

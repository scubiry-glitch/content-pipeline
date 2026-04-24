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

  enqueueRun: (body: { scope: any; axis: string; subDims?: string[]; preset?: string; strategy?: string; triggeredBy?: string }) =>
    jpost<{ ok: boolean; runId?: string; reason?: string }>('/runs', body),
  listRuns: (q: { scopeKind?: string; scopeId?: string; axis?: string; state?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams(Object.entries(q).reduce((acc: Record<string, string>, [k, v]) => {
      if (v !== undefined) acc[k] = String(v);
      return acc;
    }, {})).toString();
    return jget<{ items: any[] }>(`/runs${qs ? '?' + qs : ''}`);
  },
  getRun: (id: string) => jget<any>(`/runs/${id}`),
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
  listMeetings: (q: { limit?: number } = {}) => {
    const qs = q.limit ? `?limit=${q.limit}` : '';
    return jget<{ items: any[]; libraryRuns: any[] }>(`/meetings${qs}`);
  },
  createMeeting: (body: { title?: string; meetingKind?: string }) =>
    jpost<{ id: string; title: string; created_at: string }>('/meetings', body),
  unbindScope: (scopeId: string, meetingId: string) =>
    jdelete<{ success: boolean }>(`/scopes/${scopeId}/bindings/${meetingId}`),

  // Sources (ingest)
  listSources: () => jget<{ items: any[] }>('/sources'),
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

// CEO 应用 — 共享 fetch 客户端
// 所有 /api/v1/ceo/* 请求统一从这里出，便于后续替换为 axios / SWR / RQ

const BASE = '/api/v1/ceo';

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CEO API ${path} → ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

/**
 * R3-7: 把全局 scope 过滤拼成 query string.
 *   - scopeIds 为空 → 返回 ''
 *   - 1 个 → ?scopeId=xxx (legacy 兼容)
 *   - 多个 → ?scopes=id1,id2,...
 */
export function buildScopeQuery(scopeIds: string[] | undefined): string {
  if (!scopeIds || scopeIds.length === 0) return '';
  if (scopeIds.length === 1) return `?scopeId=${encodeURIComponent(scopeIds[0])}`;
  return `?scopes=${scopeIds.map(encodeURIComponent).join(',')}`;
}

export const ceoApi = {
  health: () => jsonFetch<{ ok: boolean; module: string; db: string; schedulerRunning: boolean }>('/health'),
  dashboard: (scopeId?: string) =>
    jsonFetch<{ rooms: any[]; note: string }>(
      `/dashboard${scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : ''}`,
    ),

  compass: {
    dashboard: (scopeId?: string) =>
      jsonFetch<{
        question: string;
        metric: { label: string; value: string; delta: string };
        lines: { main: number; branch: number; drift: number };
        attention: { main: number; branch: number; firefighting: number; total: number };
        driftAlerts: Array<{ name: string; delta: string; text: string }>;
        alignmentScore: number;
      }>(`/compass/dashboard${scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : ''}`),
    lines: (params: { scopeId?: string; kind?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.scopeId) q.set('scopeId', params.scopeId);
      if (params.kind) q.set('kind', params.kind);
      const qs = q.toString();
      return jsonFetch<{
        items: Array<{
          id: string;
          scope_id: string | null;
          name: string;
          kind: string;
          alignment_score: number | null;
          status: string;
          description: string | null;
        }>;
      }>(`/compass/lines${qs ? `?${qs}` : ''}`);
    },
    recompute: (scopeId?: string) =>
      jsonFetch<{ scopeId: string | null; alignmentScore: number }>(
        `/compass/recompute${scopeId ? `?scopeId=${encodeURIComponent(scopeId)}` : ''}`,
        { method: 'POST' },
      ),
  },
};

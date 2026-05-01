// Brain 客户端 API

export interface BrainTask {
  id: string;
  module: string;
  scope_kind: string;
  scope_id: string | null;
  axis: string;
  state: string;
  triggered_by: string;
  preset: string;
  progress_pct: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

export interface BrainOverview {
  byModule: Record<string, { queued: number; running: number; succeeded: number; failed: number }>;
  recentLlmCalls: number;
}

export async function fetchBrainTasks(filter: {
  state?: string;
  module?: string;
  limit?: number;
}): Promise<BrainTask[]> {
  const q = new URLSearchParams();
  if (filter.state) q.set('state', filter.state);
  if (filter.module) q.set('module', filter.module);
  if (filter.limit) q.set('limit', String(filter.limit));
  try {
    const res = await fetch(`/api/v1/ceo/brain/tasks?${q.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { items: BrainTask[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function fetchBrainOverview(): Promise<BrainOverview> {
  try {
    const res = await fetch('/api/v1/ceo/brain/overview');
    if (!res.ok) return { byModule: {}, recentLlmCalls: 0 };
    return (await res.json()) as BrainOverview;
  } catch {
    return { byModule: {}, recentLlmCalls: 0 };
  }
}

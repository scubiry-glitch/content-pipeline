// Boardroom · ③ 外脑批注 service
//
// 数据源: ceo_boardroom_annotations (g4-annotations LLM 任务产物)
// 启动新生成: enqueueCeoRun(g4, kind=annotations) → handleG4 LLM 调用 → 落表

import type { CeoEngineDeps } from '../../types.js';
import { enqueueCeoRun } from '../../pipelines/runQueue.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export interface Annotation {
  id: string;
  brief_id: string | null;
  scope_id: string | null;
  expert_id: string;
  expert_name: string;
  mode: 'synthesis' | 'contrast' | 'counter' | 'extension';
  highlight: string;
  body_md: string;
  citations: Array<{ type: string; id?: string; label: string }>;
  generated_run_id: string | null;
  created_at: string;
}

export async function listAnnotations(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  filter: { briefId?: string; scopeIds?: string[]; limit?: number },
): Promise<{ items: Annotation[]; source: 'real' | 'empty' }> {
  const limit = Math.max(1, Math.min(filter.limit ?? 20, 100));
  const r = await deps.db.query(
    `SELECT id::text, brief_id::text, scope_id::text,
            expert_id, expert_name, mode, highlight, body_md, citations,
            generated_run_id, created_at
       FROM ceo_boardroom_annotations
      WHERE ($1::uuid IS NULL OR brief_id = $1::uuid)
        AND ($2::uuid[] IS NULL OR scope_id = ANY($2::uuid[]))
        AND ${wsFilterClause(4)}
      ORDER BY created_at DESC
      LIMIT $3`,
    [
      filter.briefId ?? null,
      filter.scopeIds && filter.scopeIds.length > 0 ? filter.scopeIds : null,
      limit,
      workspaceId,
    ],
  );

  return {
    items: r.rows.map((row) => ({
      id: row.id,
      brief_id: row.brief_id ?? null,
      scope_id: row.scope_id ?? null,
      expert_id: row.expert_id,
      expert_name: row.expert_name,
      mode: row.mode,
      highlight: row.highlight,
      body_md: row.body_md,
      citations:
        typeof row.citations === 'string'
          ? JSON.parse(row.citations)
          : Array.isArray(row.citations)
          ? row.citations
          : [],
      generated_run_id: row.generated_run_id ?? null,
      created_at:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    })),
    source: r.rows.length > 0 ? 'real' : 'empty',
  };
}

/**
 * 触发一次 LLM 生成: g4-annotations
 *   metadata.kind = 'annotations'
 *   metadata.briefId / metadata.expertId / metadata.expertName
 *   metadata.contextHint (可选)
 */
export async function generateAnnotation(
  deps: CeoEngineDeps,
  payload: {
    briefId?: string | null;
    scopeId?: string | null;
    expertId: string;
    expertName: string;
    contextHint?: string;
  },
): Promise<{ runId: string }> {
  const enq = await enqueueCeoRun(deps, {
    axis: 'boardroom-annotations',
    scopeId: payload.scopeId ?? null,
    metadata: {
      kind: 'annotations',
      briefId: payload.briefId ?? null,
      expertId: payload.expertId,
      expertName: payload.expertName,
      contextHint: payload.contextHint ?? null,
      currentStep: 'queued',
    },
  });

  if (!enq.ok || !enq.runId) {
    throw new Error('Failed to enqueue boardroom-annotations run');
  }
  return { runId: enq.runId };
}

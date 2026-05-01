// axes/knowledge/modelHitrateComputer.ts — 心智模型命中率（6m 滚动校准）
//
// 派生 axis：从 mn_mental_model_invocations 聚合 (model_name, scope, window) →
// total_invocations / correct_count / hit_rate，写入 mn_model_hitrates。
// 不调用 LLM。

import { emptyResult, type ComputeArgs, type ComputeResult, normalizeScopeIdForPersist } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

const WINDOW_DAYS: Record<string, number | null> = {
  '7d': 7, '30d': 30, '90d': 90, '6m': 180, '1y': 365, 'all': null,
};

export async function computeModelHitrate(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('model_hitrate');
  const window = '6m';
  const days = WINDOW_DAYS[window];
  const scopeId = normalizeScopeIdForPersist(args);

  // 聚合：按 model_name 统计窗口内 invocation 数 + correct 数
  // scope_id NULL 时聚合全库；非 NULL 时按 mn_scopes 关联会议过滤
  const sql = scopeId
    ? `SELECT mmi.model_name,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE mmi.correctly_used = TRUE)::int AS correct
         FROM mn_mental_model_invocations mmi
         JOIN mn_scope_members msm ON msm.meeting_id = mmi.meeting_id
        WHERE msm.scope_id = $1::uuid
          ${days !== null ? 'AND mmi.created_at >= NOW() - $2::interval' : ''}
        GROUP BY mmi.model_name`
    : `SELECT model_name,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE correctly_used = TRUE)::int AS correct
         FROM mn_mental_model_invocations
        ${days !== null ? 'WHERE created_at >= NOW() - $1::interval' : ''}
        GROUP BY model_name`;

  const params: unknown[] = scopeId ? [scopeId] : [];
  if (days !== null) params.push(`${days} days`);

  const r = await deps.db.query(sql, params);

  for (const row of r.rows) {
    const total = Number(row.total) || 0;
    const correct = Number(row.correct) || 0;
    const hitRate = total === 0 ? 0 : Number((correct / total).toFixed(3));

    await deps.db.query(
      `INSERT INTO mn_model_hitrates
         (scope_id, model_name, window_label, total_invocations, correct_count, hit_rate, computed_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), model_name, window_label)
       DO UPDATE SET
         total_invocations = EXCLUDED.total_invocations,
         correct_count = EXCLUDED.correct_count,
         hit_rate = EXCLUDED.hit_rate,
         computed_at = NOW()`,
      [scopeId, row.model_name, window, total, correct, hitRate],
    );
    out.created++;
  }
  return out;
}

// longitudinal/mentalModelHitRate.ts — 心智模型命中率统计
//
// 聚合 mn_mental_model_invocations（correctly_used）：
//   hits     = count(correctly_used = TRUE)
//   hit_rate = hits / invocations
//   flag:
//     >=80%    priority
//     <65% 且 30 天趋势下行   downweight
//     0 invocations         unused
//     其他                  neutral

import type { MeetingNotesDeps } from '../types.js';

export class MentalModelHitRate {
  constructor(private readonly deps: MeetingNotesDeps) {}

  async recomputeForScope(scopeId: string | null, runId?: string | null): Promise<{ rows: number }> {
    const scopeClause = scopeId
      ? `AND mmi.meeting_id IN (SELECT meeting_id FROM mn_scope_members WHERE scope_id = $1)`
      : '';
    const params: any[] = scopeId ? [scopeId] : [];

    const r = await this.deps.db.query(
      `SELECT
          mmi.model_name,
          COUNT(*)::int                                                AS invocations,
          COUNT(*) FILTER (WHERE mmi.correctly_used = TRUE)::int       AS hits,
          COUNT(*) FILTER (WHERE mmi.correctly_used = TRUE
                              AND mmi.created_at > NOW() - INTERVAL '30 days')::int AS hits_30d,
          COUNT(*) FILTER (WHERE mmi.created_at > NOW() - INTERVAL '30 days')::int  AS inv_30d
        FROM mn_mental_model_invocations mmi
        WHERE 1 = 1 ${scopeClause}
        GROUP BY mmi.model_name`,
      params,
    );

    let updated = 0;
    for (const row of r.rows) {
      const invocations = Number(row.invocations);
      const hits = Number(row.hits);
      const inv30 = Number(row.inv_30d) || 0;
      const hit30 = Number(row.hits_30d) || 0;
      const hitRate = invocations > 0 ? hits / invocations : 0;
      const trend30d = inv30 > 0 ? hit30 / inv30 : hitRate;

      let flag: 'priority' | 'downweight' | 'unused' | 'neutral' = 'neutral';
      if (invocations === 0) flag = 'unused';
      else if (hitRate >= 0.8) flag = 'priority';
      else if (hitRate < 0.65 && trend30d < hitRate) flag = 'downweight';

      await this.deps.db.query(
        `INSERT INTO mn_mental_model_hit_stats
           (model_name, scope_id, invocations, hits, hit_rate, trend_30d, flag,
            computed_at, last_updated_run_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
         ON CONFLICT (model_name, scope_id) DO UPDATE SET
           invocations = EXCLUDED.invocations,
           hits = EXCLUDED.hits,
           hit_rate = EXCLUDED.hit_rate,
           trend_30d = EXCLUDED.trend_30d,
           flag = EXCLUDED.flag,
           computed_at = NOW(),
           last_updated_run_id = EXCLUDED.last_updated_run_id`,
        [row.model_name, scopeId ?? null, invocations, hits, hitRate.toFixed(4),
         trend30d.toFixed(4), flag, runId ?? null],
      );
      updated++;
    }
    return { rows: updated };
  }

  async listForScope(scopeId: string | null) {
    const r = await this.deps.db.query(
      `SELECT model_name, invocations, hits, hit_rate, trend_30d, flag, computed_at
         FROM mn_mental_model_hit_stats
         WHERE COALESCE(scope_id::text,'') = COALESCE($1::text,'')
         ORDER BY hit_rate DESC NULLS LAST`,
      [scopeId ?? null],
    );
    return r.rows;
  }
}

// axes/knowledge/externalExpertsComputer.ts — 外部专家注释
//
// 派生：从 mn_mental_model_invocations.expert_source 聚合 cite_count，
// 落盘 mn_external_experts。accuracy_score 来自 correctly_used 比率。

import { emptyResult, type ComputeArgs, type ComputeResult, normalizeScopeIdForPersist } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

export async function computeExternalExperts(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('external_experts');
  const scopeId = normalizeScopeIdForPersist(args);

  const sql = scopeId
    ? `SELECT mmi.expert_source AS name,
              MIN(mmi.model_name) AS domain,
              COUNT(*)::int AS cite_count,
              AVG(CASE WHEN mmi.correctly_used = TRUE THEN 1.0 WHEN mmi.correctly_used = FALSE THEN 0.0 ELSE NULL END) AS acc,
              jsonb_agg(jsonb_build_object(
                'meeting_id', mmi.meeting_id,
                'by_person_id', mmi.invoked_by_person_id,
                'citation_text', mmi.outcome
              )) AS cites
         FROM mn_mental_model_invocations mmi
         JOIN mn_scope_members msm ON msm.meeting_id = mmi.meeting_id
        WHERE msm.scope_id = $1::uuid
          AND mmi.expert_source IS NOT NULL AND mmi.expert_source <> ''
        GROUP BY mmi.expert_source`
    : `SELECT expert_source AS name,
              MIN(model_name) AS domain,
              COUNT(*)::int AS cite_count,
              AVG(CASE WHEN correctly_used = TRUE THEN 1.0 WHEN correctly_used = FALSE THEN 0.0 ELSE NULL END) AS acc,
              jsonb_agg(jsonb_build_object(
                'meeting_id', meeting_id,
                'by_person_id', invoked_by_person_id,
                'citation_text', outcome
              )) AS cites
         FROM mn_mental_model_invocations
        WHERE expert_source IS NOT NULL AND expert_source <> ''
        GROUP BY expert_source`;

  const params = scopeId ? [scopeId] : [];
  const r = await deps.db.query(sql, params);

  for (const row of r.rows) {
    const name: string = String(row.name || '').trim().slice(0, 120);
    if (!name) continue;
    const domain: string | null = row.domain ? String(row.domain).slice(0, 80) : null;
    const accNum = row.acc !== null && row.acc !== undefined ? Number(row.acc) : null;
    const accuracy = accNum === null || Number.isNaN(accNum) ? null : Number(accNum.toFixed(2));

    await deps.db.query(
      `INSERT INTO mn_external_experts
         (name, domain, cited_in_meetings, cite_count, accuracy_score)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (name, COALESCE(domain, ''))
       DO UPDATE SET
         cited_in_meetings = EXCLUDED.cited_in_meetings,
         cite_count = EXCLUDED.cite_count,
         accuracy_score = COALESCE(EXCLUDED.accuracy_score, mn_external_experts.accuracy_score)`,
      [name, domain, JSON.stringify(row.cites ?? []), Number(row.cite_count) || 0, accuracy],
    );
    out.created++;
  }

  return out;
}

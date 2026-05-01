// axes/knowledge/conceptDriftComputer.ts — 概念漂移
//
// Lite 实现：从 mn_judgments.text 抽取重复出现的高频名词术语（≥3 次跨会议），
// 标记为可能的"概念漂移候选"，写入 mn_concept_drifts。
// drift_severity 暂置 'low'，definition_at_meeting 累积出现的 (meeting_id, snippet) 列表。
// 后续可叠加 LLM 对比定义文本判断真实漂移。

import { emptyResult, type ComputeArgs, type ComputeResult, normalizeScopeIdForPersist } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

export async function computeConceptDrift(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('concept_drift');
  const scopeId = normalizeScopeIdForPersist(args);

  // 拉取所有相关 judgments
  const sql = scopeId
    ? `SELECT j.id, j.text, j.abstracted_from_meeting_id AS meeting_id, j.created_at
         FROM mn_judgments j
         JOIN mn_scope_members msm ON msm.meeting_id = j.abstracted_from_meeting_id
        WHERE msm.scope_id = $1::uuid
        ORDER BY j.created_at`
    : `SELECT id, text, abstracted_from_meeting_id AS meeting_id, created_at
         FROM mn_judgments ORDER BY created_at`;
  const params = scopeId ? [scopeId] : [];
  const r = await deps.db.query(sql, params);

  // 简化抽取：取每条 judgment 文本里的引号包裹术语「xxx」"xxx" 'xxx'，或长度 2-8 的中文复合名词
  const QUOTED = /[「『"'""''](.{2,30}?)[」』"'""'']/g;
  const termHits = new Map<string, Array<{ meeting_id: string; def_text: string; observed_at: string }>>();

  for (const row of r.rows) {
    const text: string = row.text || '';
    const matches = Array.from(text.matchAll(QUOTED));
    for (const m of matches) {
      const term = m[1].trim();
      if (term.length < 2 || term.length > 30) continue;
      if (!termHits.has(term)) termHits.set(term, []);
      termHits.get(term)!.push({
        meeting_id: row.meeting_id,
        def_text: text.slice(0, 200),
        observed_at: new Date(row.created_at).toISOString(),
      });
    }
  }

  // 出现次数 ≥ 3 且跨 ≥ 2 个不同会议的视为漂移候选
  for (const [term, occurrences] of termHits) {
    const distinctMeetings = new Set(occurrences.map((o) => o.meeting_id));
    if (occurrences.length < 3 || distinctMeetings.size < 2) continue;

    const firstAt = occurrences[0].observed_at;
    const lastAt = occurrences[occurrences.length - 1].observed_at;

    await deps.db.query(
      `INSERT INTO mn_concept_drifts
         (scope_id, term, definition_at_meeting, drift_severity, first_observed_at, last_observed_at)
       VALUES ($1::uuid, $2, $3::jsonb, 'low', $4::timestamptz, $5::timestamptz)
       ON CONFLICT (COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), term)
       DO UPDATE SET
         definition_at_meeting = EXCLUDED.definition_at_meeting,
         last_observed_at = EXCLUDED.last_observed_at`,
      [scopeId, term, JSON.stringify(occurrences), firstAt, lastAt],
    );
    out.created++;
  }

  return out;
}

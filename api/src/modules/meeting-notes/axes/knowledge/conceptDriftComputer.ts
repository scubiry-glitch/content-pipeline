// axes/knowledge/conceptDriftComputer.ts — 概念漂移
//
// 数据源：mn_mental_model_invocations.model_name（mental_models 已抽出的术语）
// 漂移信号 = 同一 canonical 概念在跨会议中以不同 model_name 变体出现
// 例如 "路径依赖" / "路径依赖（path dependence）" / "路径依赖（Path Dependence）"
// canonicalize: lower + 剥英文括注 + 删两端空白
// 阈值: 跨 ≥2 不同会议；任何变体数都接受
// drift_severity:
//   variants ≥ 3   → high (强术语漂移)
//   variants == 2 或 mtgs ≥ 5 → med
//   variants == 1 且 mtgs < 5  → low
// 历史的"引号正则抓 mn_judgments.text"路径数学上必为 0 行（top term 仅 2 次），
// 已废弃。LLM 语义漂移检测留待后续真实需求时叠加。

import { emptyResult, pushErrorSample, type ComputeArgs, type ComputeResult, normalizeScopeIdForPersist } from '../_shared.js';
import type { MeetingNotesDeps } from '../../types.js';

interface InvocationRow {
  meeting_id: string;
  model_name: string;
  outcome: string | null;
  correctly_used: boolean | null;
  created_at: string | Date;
}

interface DefEntry {
  meeting_id: string;
  observed_at: string;
  model_variant: string;
  outcome: string | null;
  correctly_used: boolean | null;
  source: 'mental_model_invocation';
}

function canonicalizeModelName(raw: string): string {
  // 剥末尾的英文/中文括注（路径依赖（path dependence） → 路径依赖）
  const stripped = raw.replace(/[（(][^（()）]*[)）]\s*$/g, '').trim();
  // 同时折叠多余空白与大小写差异
  return stripped.replace(/\s+/g, ' ').toLowerCase();
}

function classifySeverity(variantCount: number, meetingCount: number): 'low' | 'med' | 'high' {
  if (variantCount >= 3) return 'high';
  if (variantCount >= 2 || meetingCount >= 5) return 'med';
  return 'low';
}

export async function computeConceptDrift(
  deps: MeetingNotesDeps,
  args: ComputeArgs,
): Promise<ComputeResult> {
  const out = emptyResult('concept_drift');
  const scopeId = normalizeScopeIdForPersist(args);

  const sql = scopeId
    ? `SELECT mmi.meeting_id::text AS meeting_id,
              mmi.model_name,
              mmi.outcome,
              mmi.correctly_used,
              mmi.created_at
         FROM mn_mental_model_invocations mmi
         JOIN mn_scope_members msm ON msm.meeting_id = mmi.meeting_id
        WHERE msm.scope_id = $1::uuid
          AND mmi.model_name IS NOT NULL
          AND length(trim(mmi.model_name)) > 0
        ORDER BY mmi.created_at`
    : `SELECT meeting_id::text AS meeting_id,
              model_name,
              outcome,
              correctly_used,
              created_at
         FROM mn_mental_model_invocations
        WHERE model_name IS NOT NULL
          AND length(trim(model_name)) > 0
        ORDER BY created_at`;
  const params = scopeId ? [scopeId] : [];
  const rows: InvocationRow[] = (await deps.db.query(sql, params)).rows;

  // Guard: 上游素材为空（fresh scope / mental_models 还没跑） → 干净返回
  if (rows.length === 0) return out;

  // 按 canonical 聚合
  const byCanonical = new Map<string, {
    variants: Set<string>;
    meetings: Set<string>;
    entries: DefEntry[];
    firstAt: string;
    lastAt: string;
  }>();

  for (const row of rows) {
    const variant = (row.model_name || '').trim();
    if (!variant) continue;
    const canon = canonicalizeModelName(variant);
    if (!canon || canon.length < 2) continue;

    const observedAt = new Date(row.created_at).toISOString();
    let bucket = byCanonical.get(canon);
    if (!bucket) {
      bucket = {
        variants: new Set(),
        meetings: new Set(),
        entries: [],
        firstAt: observedAt,
        lastAt: observedAt,
      };
      byCanonical.set(canon, bucket);
    }
    bucket.variants.add(variant);
    bucket.meetings.add(row.meeting_id);
    bucket.entries.push({
      meeting_id: row.meeting_id,
      observed_at: observedAt,
      model_variant: variant,
      outcome: row.outcome ? row.outcome.slice(0, 240) : null,
      correctly_used: row.correctly_used,
      source: 'mental_model_invocation',
    });
    if (observedAt < bucket.firstAt) bucket.firstAt = observedAt;
    if (observedAt > bucket.lastAt) bucket.lastAt = observedAt;
  }

  // replaceExisting=true：先清掉本 scope 下旧 drift（保留其它 scope）
  if (args.replaceExisting) {
    try {
      if (scopeId) {
        await deps.db.query(`DELETE FROM mn_concept_drifts WHERE scope_id = $1::uuid`, [scopeId]);
      } else {
        await deps.db.query(`DELETE FROM mn_concept_drifts WHERE scope_id IS NULL`);
      }
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', `replaceExisting cleanup: ${(e as Error).message}`);
    }
  }

  // 写入：跨 ≥2 会议即为漂移候选
  for (const [canon, bucket] of byCanonical) {
    if (bucket.meetings.size < 2) {
      out.skipped += 1;
      continue;
    }

    // term 取出现次数最多的变体（更自然的"显示名"）；canonical 太损失大小写
    const variantCounts = new Map<string, number>();
    for (const e of bucket.entries) {
      variantCounts.set(e.model_variant, (variantCounts.get(e.model_variant) || 0) + 1);
    }
    const displayTerm = [...variantCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0][0]
      .slice(0, 200);

    // entries 按时间升序
    bucket.entries.sort((a, b) => a.observed_at.localeCompare(b.observed_at));

    const severity = classifySeverity(bucket.variants.size, bucket.meetings.size);

    try {
      await deps.db.query(
        `INSERT INTO mn_concept_drifts
           (scope_id, term, definition_at_meeting, drift_severity, first_observed_at, last_observed_at)
         VALUES ($1::uuid, $2, $3::jsonb, $4, $5::timestamptz, $6::timestamptz)
         ON CONFLICT (COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), term)
         DO UPDATE SET
           definition_at_meeting = EXCLUDED.definition_at_meeting,
           drift_severity = EXCLUDED.drift_severity,
           first_observed_at = LEAST(mn_concept_drifts.first_observed_at, EXCLUDED.first_observed_at),
           last_observed_at = GREATEST(mn_concept_drifts.last_observed_at, EXCLUDED.last_observed_at)`,
        [scopeId, displayTerm, JSON.stringify(bucket.entries), severity, bucket.firstAt, bucket.lastAt],
      );
      out.created += 1;
    } catch (e) {
      out.errors += 1;
      pushErrorSample(out, 'db', (e as Error).message, `term=${displayTerm} canon=${canon}`);
    }
  }

  return out;
}

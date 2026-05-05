// Situation · 聚合算子
// coverage = 已覆盖 stakeholder kind / 5 (customer/regulator/investor/press/partner)

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export const REQUIRED_KINDS = ['customer', 'regulator', 'investor', 'press', 'partner'] as const;
const KIND_LABELS: Record<string, string> = {
  customer: '客户',
  regulator: '监管',
  investor: 'LP/投资人',
  press: '媒体',
  partner: '同行',
};

export async function computeCoverage(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<{ covered: number; total: number; missing: string[] }> {
  const r = await deps.db.query(
    `SELECT DISTINCT kind
       FROM ceo_stakeholders
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND ${wsFilterClause(2)}`,
    [scopeId ?? null, workspaceId],
  );
  const present = new Set(r.rows.map((row) => row.kind));
  const missing = REQUIRED_KINDS.filter((k) => !present.has(k)).map((k) => KIND_LABELS[k] ?? k);
  return {
    covered: REQUIRED_KINDS.length - missing.length,
    total: REQUIRED_KINDS.length,
    missing,
  };
}

/** 信号 horizon 切片 — 7d/30d/90d 数量 */
export async function computeHorizon(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<{ near_7d: number; mid_30d: number; far_90d: number }> {
  const result = { near_7d: 0, mid_30d: 0, far_90d: 0 };
  try {
    const r = await deps.db.query(
      `SELECT
         SUM(CASE WHEN captured_at > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS near_7d,
         SUM(CASE WHEN captured_at > NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END)::int AS mid_30d,
         SUM(CASE WHEN captured_at > NOW() - INTERVAL '90 days' THEN 1 ELSE 0 END)::int AS far_90d
       FROM ceo_external_signals s
       LEFT JOIN ceo_stakeholders h ON h.id = s.stakeholder_id
       WHERE ($1::uuid IS NULL OR h.scope_id = $1::uuid)
         AND ${wsFilterClause(2, 's.workspace_id')}`,
      [scopeId ?? null, workspaceId],
    );
    const row = r.rows[0];
    if (row) {
      result.near_7d = Number(row.near_7d ?? 0);
      result.mid_30d = Number(row.mid_30d ?? 0);
      result.far_90d = Number(row.far_90d ?? 0);
    }
  } catch { /* ignore */ }
  return result;
}

/** 4 条规则触发的盲点检测 */
export async function computeBlindspots(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<{
  items: Array<{
    id: string;
    name: string;
    severity: 'high' | 'medium' | 'low';
    trigger_rule: string;
    narrative: string;
    suggested_action: string;
  }>;
}> {
  const items: any[] = [];

  // Rule 1: 缺失 stakeholder kind 但近 30 天 director_concerns 中 0 提及
  try {
    const cov = await computeCoverage(deps, workspaceId, scopeId);
    if (cov.missing.length > 0) {
      items.push({
        id: 'blind-coverage',
        name: `未覆盖的 stakeholder kind: ${cov.missing.join(' / ')}`,
        severity: 'high' as const,
        trigger_rule: `DISTINCT(kind) ⊉ {${cov.missing.join(',')}}`,
        narrative: `缺少 ${cov.missing.join(' / ')} 视角 — 决策依据可能片面。`,
        suggested_action: `在下次 IC 议程加入对应方视角的 1 条数据点。`,
      });
    }
  } catch { /* ignore */ }

  // Rule 2: rubric.LP 任一维 < 0.5 持续 14 天
  try {
    const r = await deps.db.query(
      `SELECT rs.dimension, AVG(rs.score)::float AS score
         FROM ceo_rubric_scores rs
         LEFT JOIN ceo_stakeholders h ON h.id = rs.stakeholder_id
        WHERE h.kind = 'investor'
          AND ($1::uuid IS NULL OR rs.scope_id = $1::uuid)
          AND ${wsFilterClause(2, 'rs.workspace_id')}
        GROUP BY rs.dimension
        HAVING AVG(rs.score) < 0.5`,
      [scopeId ?? null, workspaceId],
    );
    for (const row of r.rows) {
      items.push({
        id: `blind-rubric-${row.dimension}`,
        name: `Rubric「${row.dimension}」LP 维度跌穿 0.5`,
        severity: 'high' as const,
        trigger_rule: `rubric.investor.${row.dimension} < 0.5 当前 ${Number(row.score).toFixed(2)}`,
        narrative: `LP 在 ${row.dimension} 维度的感受持续偏低，可能侵蚀长期信任。`,
        suggested_action: `本周 1v1，主动给草案 + 数据，不要等"全部就绪"。`,
      });
    }
  } catch { /* ignore */ }

  // Rule 3: partner sentiment 14d 滚动均值 < -0.2
  try {
    const r = await deps.db.query(
      `SELECT AVG(s.sentiment)::float AS avg_sent
         FROM ceo_external_signals s
         LEFT JOIN ceo_stakeholders h ON h.id = s.stakeholder_id
        WHERE h.kind = 'partner'
          AND s.captured_at > NOW() - INTERVAL '14 days'
          AND ${wsFilterClause(1, 's.workspace_id')}`,
      [workspaceId],
    );
    const avg = r.rows[0]?.avg_sent;
    if (avg != null && Number(avg) < -0.2) {
      items.push({
        id: 'blind-partner-sentiment',
        name: '同行扫描信号 14d 滚动均值偏负',
        severity: 'medium' as const,
        trigger_rule: `AVG(partner.sentiment LAST 14d) = ${Number(avg).toFixed(2)}`,
        narrative: `同行视角的累计负面信号持续，但 Tower 议程未单列「同行视角」。`,
        suggested_action: `Compass 战略回响加一条 hypothesis: 同行如何看我们 → 季报作为 fact 验证。`,
      });
    }
  } catch { /* ignore */ }

  // Rule 4: employee sentiment ≥ 0.5 但 last_signal_summary 含「加班/疲劳」关键词
  try {
    const r = await deps.db.query(
      `SELECT h.name, s.signal_text
         FROM ceo_external_signals s
         LEFT JOIN ceo_stakeholders h ON h.id = s.stakeholder_id
        WHERE h.kind = 'employee'
          AND s.sentiment >= 0.5
          AND (s.signal_text ILIKE '%加班%' OR s.signal_text ILIKE '%疲劳%' OR s.signal_text ILIKE '%累%')
          AND ${wsFilterClause(1, 's.workspace_id')}
        LIMIT 1`,
      [workspaceId],
    );
    if (r.rows.length > 0) {
      items.push({
        id: 'blind-employee-burn',
        name: '关键人员加班/疲劳信号但被「正面」标签遮蔽',
        severity: 'high' as const,
        trigger_rule: `employee.sentiment ≥ 0.5 AND signal_text contains 加班/疲劳`,
        narrative: `${r.rows[0].name} 的信号情感为正面，但文本含疲劳词 — 表面好，实则风险。`,
        suggested_action: `本周 1:1 不可推迟；WeeklyReflection 加一条 prism=team 反思。`,
      });
    }
  } catch { /* ignore */ }

  return { items };
}

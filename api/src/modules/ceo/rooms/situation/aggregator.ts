// Situation · 聚合算子
// coverage = 已覆盖 stakeholder kind / 5 (customer/regulator/investor/press/partner)

import type { CeoEngineDeps } from '../../types.js';

const REQUIRED_KINDS = ['customer', 'regulator', 'investor', 'press', 'partner'] as const;
const KIND_LABELS: Record<string, string> = {
  customer: '客户',
  regulator: '监管',
  investor: 'LP/投资人',
  press: '媒体',
  partner: '同行',
};

export async function computeCoverage(
  deps: CeoEngineDeps,
  scopeId?: string,
): Promise<{ covered: number; total: number; missing: string[] }> {
  const r = await deps.db.query(
    `SELECT DISTINCT kind
       FROM ceo_stakeholders
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)`,
    [scopeId ?? null],
  );
  const present = new Set(r.rows.map((row) => row.kind));
  const missing = REQUIRED_KINDS.filter((k) => !present.has(k)).map((k) => KIND_LABELS[k] ?? k);
  return {
    covered: REQUIRED_KINDS.length - missing.length,
    total: REQUIRED_KINDS.length,
    missing,
  };
}

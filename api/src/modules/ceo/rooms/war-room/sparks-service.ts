// War Room · 灵光一闪 sparks 服务
// 数据来自 ceo_war_room_sparks (seed 12 张, seed_group 0/1/2)
// 每次 list 取一组 4 张（按 seed 切组），不在前端持久化

import type { CeoEngineDeps } from '../../types.js';

export interface SparkCard {
  id: string;
  tag: string;
  headline: string;
  evidence_short: string | null;
  why_evidence: string[];
  risk_text: string | null;
  seed_group: number;
}

const TOTAL_GROUPS = 3;

export async function listSparks(
  deps: CeoEngineDeps,
  filter: { scopeIds?: string[]; seed?: number; limit?: number },
): Promise<{ items: SparkCard[]; seedGroup: number }> {
  const seed = Math.abs(filter.seed ?? 0);
  const seedGroup = seed % TOTAL_GROUPS;
  const limit = Math.max(1, Math.min(filter.limit ?? 4, 12));

  // 优先取该 seed_group 的全部，不足则补其他组
  let r = await deps.db.query(
    `SELECT id::text, tag, headline, evidence_short, why_evidence, risk_text, seed_group
       FROM ceo_war_room_sparks
      WHERE seed_group = $1
        AND ($2::uuid[] IS NULL OR scope_id IS NULL OR scope_id = ANY($2::uuid[]))
      ORDER BY created_at DESC
      LIMIT $3`,
    [seedGroup, filter.scopeIds && filter.scopeIds.length > 0 ? filter.scopeIds : null, limit],
  );

  // 不足时回补其他组
  if (r.rows.length < limit) {
    const need = limit - r.rows.length;
    const existingIds = r.rows.map((row) => row.id);
    const fallback = await deps.db.query(
      `SELECT id::text, tag, headline, evidence_short, why_evidence, risk_text, seed_group
         FROM ceo_war_room_sparks
        WHERE seed_group <> $1
          AND ($2::text[] IS NULL OR id::text <> ALL($2::text[]))
        ORDER BY created_at DESC
        LIMIT $3`,
      [seedGroup, existingIds.length > 0 ? existingIds : null, need],
    );
    r = { ...r, rows: [...r.rows, ...fallback.rows] };
  }

  return {
    items: r.rows.map((row) => ({
      id: row.id,
      tag: row.tag,
      headline: row.headline,
      evidence_short: row.evidence_short,
      why_evidence: Array.isArray(row.why_evidence)
        ? row.why_evidence
        : typeof row.why_evidence === 'string'
        ? JSON.parse(row.why_evidence)
        : [],
      risk_text: row.risk_text,
      seed_group: Number(row.seed_group),
    })),
    seedGroup,
  };
}

// CEO scope 推荐 — 按"素材丰富度"对 mn_scopes 打分排序，给前端首次访问的默认选择用。
//
// 评分用各维度计数的加权和。权重选择反映 CEO 视角对每类素材的相对价值：
//   - 战略线 / 利益相关方 / 董事画像 → CEO 自有内容，最稀缺，权重最高
//   - judgments / commitments → 跨会议结构化产物，次重
//   - 会议数 → 原始素材量，权重最低（多不如精）
//
// 所有计数都用 LEFT JOIN / 子查询，单次 round trip。表不存在时通过 try/catch 退化到 0。

import type { CeoEngineDeps } from '../types.js';

export interface RecommendedScope {
  id: string;
  name: string;
  kind: 'project' | 'client' | 'topic';
  score: number;
  components: {
    meetings: number;
    judgments: number;
    commitments: number;
    strategicLines: number;
    directors: number;
    stakeholders: number;
  };
}

const WEIGHTS = {
  meetings: 1.0,
  judgments: 1.5,
  commitments: 1.5,
  strategicLines: 2.5,
  directors: 2.0,
  stakeholders: 2.0,
};

export async function getRecommendedScopes(
  deps: CeoEngineDeps,
  options: { limit?: number; minScore?: number } = {},
): Promise<{ items: RecommendedScope[] }> {
  const limit = Math.max(1, Math.min(10, options.limit ?? 3));
  const minScore = options.minScore ?? 1;

  let rows: any[] = [];
  try {
    const r = await deps.db.query(
      `SELECT s.id::text AS id, s.name, s.kind,
              COALESCE((SELECT COUNT(*) FROM mn_scope_members
                          WHERE scope_id = s.id), 0)::int AS meetings,
              COALESCE((SELECT COUNT(DISTINCT j.id)
                          FROM mn_judgments j
                          JOIN mn_scope_members sm ON sm.meeting_id = j.abstracted_from_meeting_id
                         WHERE sm.scope_id = s.id), 0)::int AS judgments,
              COALESCE((SELECT COUNT(DISTINCT c.id)
                          FROM mn_commitments c
                          JOIN mn_scope_members sm ON sm.meeting_id = c.meeting_id
                         WHERE sm.scope_id = s.id), 0)::int AS commitments,
              COALESCE((SELECT COUNT(*) FROM ceo_strategic_lines
                          WHERE scope_id = s.id), 0)::int AS strategic_lines,
              COALESCE((SELECT COUNT(*) FROM ceo_directors
                          WHERE scope_id = s.id), 0)::int AS directors,
              COALESCE((SELECT COUNT(*) FROM ceo_stakeholders
                          WHERE scope_id = s.id), 0)::int AS stakeholders
         FROM mn_scopes s
        WHERE s.status = 'active'`,
    );
    rows = r.rows;
  } catch (e) {
    // 表缺失或权限问题 — 不要让前端首屏挂掉
    console.warn('[ceo/recommended-scopes] query failed:', (e as Error).message);
    return { items: [] };
  }

  const scored: RecommendedScope[] = rows.map((row) => {
    const c = {
      meetings: Number(row.meetings ?? 0),
      judgments: Number(row.judgments ?? 0),
      commitments: Number(row.commitments ?? 0),
      strategicLines: Number(row.strategic_lines ?? 0),
      directors: Number(row.directors ?? 0),
      stakeholders: Number(row.stakeholders ?? 0),
    };
    const score =
      c.meetings * WEIGHTS.meetings +
      c.judgments * WEIGHTS.judgments +
      c.commitments * WEIGHTS.commitments +
      c.strategicLines * WEIGHTS.strategicLines +
      c.directors * WEIGHTS.directors +
      c.stakeholders * WEIGHTS.stakeholders;
    return {
      id: String(row.id),
      name: String(row.name),
      kind: row.kind as 'project' | 'client' | 'topic',
      score: Math.round(score * 10) / 10,
      components: c,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const filtered = scored.filter((s) => s.score >= minScore).slice(0, limit);
  return { items: filtered };
}

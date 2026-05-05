// CEO scope 推荐 — 给前端首次访问 / 默认选择用
//
// 决策顺序 (getDefaultScopes):
//   1. 先按 PREFERRED_SCOPE_NAMES 精确匹配 mn_scopes.name (用户/部署侧固化的"主战场")
//   2. 全部命中 → 返回这组
//   3. 未全部命中 → 回退到动态评分 getRecommendedScopes (按素材丰富度)
//
// 评分权重反映 CEO 视角的稀缺性：
//   - 战略线 / 利益相关方 / 董事画像 → CEO 自有内容，最稀缺，权重最高
//   - judgments / commitments → 跨会议结构化产物，次重
//   - 会议数 → 原始素材量，权重最低（多不如精）

import type { CeoEngineDeps } from '../types.js';
import { wsFilterClause } from '../shared/wsFilter.js';

// 部署侧偏好 — 用户/环境固化的默认 scope 名字 (按出现顺序就是 UI 上的默认勾选顺序)
// 通过 CEO_PREFERRED_SCOPES 环境变量覆盖（逗号分隔），未设置则用代码中的列表
const PREFERRED_SCOPE_NAMES: string[] = (process.env.CEO_PREFERRED_SCOPES ?? '集团分析,业务支持,美租')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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
  workspaceId: string | null,
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
                         WHERE sm.scope_id = s.id
                           AND ${wsFilterClause(1, 'j.workspace_id')}), 0)::int AS judgments,
              COALESCE((SELECT COUNT(DISTINCT c.id)
                          FROM mn_commitments c
                          JOIN mn_scope_members sm ON sm.meeting_id = c.meeting_id
                         WHERE sm.scope_id = s.id
                           AND ${wsFilterClause(1, 'c.workspace_id')}), 0)::int AS commitments,
              COALESCE((SELECT COUNT(*) FROM ceo_strategic_lines
                          WHERE scope_id = s.id
                            AND ${wsFilterClause(1)}), 0)::int AS strategic_lines,
              COALESCE((SELECT COUNT(*) FROM ceo_directors
                          WHERE scope_id = s.id
                            AND ${wsFilterClause(1)}), 0)::int AS directors,
              COALESCE((SELECT COUNT(*) FROM ceo_stakeholders
                          WHERE scope_id = s.id
                            AND ${wsFilterClause(1)}), 0)::int AS stakeholders
         FROM mn_scopes s
        WHERE s.status = 'active'
          AND ${wsFilterClause(1, 's.workspace_id')}`,
      [workspaceId],
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

/**
 * 默认 scope 解析 — 给前端首屏自动套用用
 * 先精确匹配 PREFERRED_SCOPE_NAMES；全部命中则按名字顺序返回；
 * 未全部命中则回退到 getRecommendedScopes (动态评分)。
 *
 * 返回的 items 携带 score=0 且 components 全 0 时，表示通过 preferred-name 命中
 * (前端可显示"按部署偏好默认选中" tooltip)。
 */
export async function getDefaultScopes(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  options: { fallbackLimit?: number } = {},
): Promise<{ items: RecommendedScope[]; mode: 'preferred' | 'recommended' | 'empty' }> {
  if (PREFERRED_SCOPE_NAMES.length > 0) {
    try {
      const r = await deps.db.query(
        `SELECT s.id::text AS id, s.name, s.kind
           FROM mn_scopes s
          WHERE s.status = 'active'
            AND s.name = ANY($1::text[])
            AND ${wsFilterClause(2, 's.workspace_id')}`,
        [PREFERRED_SCOPE_NAMES, workspaceId],
      );
      const found = new Map<string, { id: string; name: string; kind: string }>(
        r.rows.map((row: any) => [String(row.name), { id: String(row.id), name: String(row.name), kind: String(row.kind) }]),
      );
      // 全部命中 → 按 PREFERRED_SCOPE_NAMES 的原始顺序返回
      if (found.size === PREFERRED_SCOPE_NAMES.length) {
        const items: RecommendedScope[] = PREFERRED_SCOPE_NAMES
          .map((name) => found.get(name))
          .filter((x): x is { id: string; name: string; kind: string } => !!x)
          .map((s) => ({
            id: s.id,
            name: s.name,
            kind: s.kind as 'project' | 'client' | 'topic',
            score: 0,
            components: { meetings: 0, judgments: 0, commitments: 0, strategicLines: 0, directors: 0, stakeholders: 0 },
          }));
        return { items, mode: 'preferred' };
      }
    } catch (e) {
      console.warn('[ceo/getDefaultScopes] preferred lookup failed:', (e as Error).message);
    }
  }
  // 回退: 动态评分
  const r = await getRecommendedScopes(deps, workspaceId, { limit: options.fallbackLimit ?? 3 });
  return { items: r.items, mode: r.items.length > 0 ? 'recommended' : 'empty' };
}

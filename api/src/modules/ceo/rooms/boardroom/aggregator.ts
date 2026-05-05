// Boardroom · 聚合算子
// forward_pct = 预读包 toc 中 future-tagged 章节字数 / 总字数

import type { CeoEngineDeps } from '../../types.js';
import { wsFilterClause } from '../../shared/wsFilter.js';

export async function computeForwardPct(
  deps: CeoEngineDeps,
  workspaceId: string | null,
  scopeId?: string,
): Promise<number> {
  // 取最新 brief，看 toc jsonb 里 future_tagged 章节占比
  const r = await deps.db.query(
    `SELECT toc, page_count
       FROM ceo_briefs
      WHERE ($1::uuid IS NULL OR scope_id = $1::uuid)
        AND status IN ('draft','sent')
        AND ${wsFilterClause(2)}
      ORDER BY updated_at DESC
      LIMIT 1`,
    [scopeId ?? null, workspaceId],
  );
  if (r.rows.length === 0) return 0;
  const toc = r.rows[0].toc;
  if (!Array.isArray(toc) || toc.length === 0) return 0;

  // 章节范围语义：'p.5-7' → 3 页；future_tagged 标记前瞻章节
  let totalPages = 0;
  let futurePages = 0;
  for (const sec of toc as Array<Record<string, unknown>>) {
    const pageRange = String(sec.page_range ?? sec.pages ?? '');
    const m = pageRange.match(/p\.?(\d+)-(\d+)/i);
    let pages = 1;
    if (m) pages = Math.max(1, Number(m[2]) - Number(m[1]) + 1);
    totalPages += pages;
    if (sec.future_tagged === true) futurePages += pages;
  }
  if (totalPages === 0) return 0;
  return Number((futurePages / totalPages).toFixed(3));
}

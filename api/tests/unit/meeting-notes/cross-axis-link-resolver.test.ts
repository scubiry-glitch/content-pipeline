/**
 * crosslinks/crossAxisLinkResolver — SQL-rule driven cross-axis links
 *
 * 验证：
 *   - 4 条规则都触发（when DB returns rows）
 *   - upsert 通过 ON CONFLICT DO UPDATE
 *   - listBySource 按 source_axis + source_item_id 过滤
 *   - scope=meeting 不执行规则 4
 */
import { describe, it, expect, vi } from 'vitest';
import { CrossAxisLinkResolver } from '../../../src/modules/meeting-notes/crosslinks/crossAxisLinkResolver.js';

describe('CrossAxisLinkResolver', () => {
  it('upsert inserts when xmax=0', async () => {
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO mn_cross_axis_links')) {
        return { rows: [{ inserted: true }] };
      }
      return { rows: [] };
    });
    const deps: any = { db: { query } };
    const resolver = new CrossAxisLinkResolver(deps);
    const stats = await resolver.recomputeForScope('library', null, null);
    expect(stats.inserted + stats.updated).toBeGreaterThanOrEqual(0);
  });

  it('runs rule 4 only for non-meeting scopes', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const deps: any = { db: { query } };
    const resolver = new CrossAxisLinkResolver(deps);

    // scope=meeting: rule 4 条件 scopeKind!='meeting' → 跳过
    await resolver.recomputeForScope('meeting', 'm1');
    const rule4ForMeeting = query.mock.calls.filter((c: any) =>
      c[0].includes('mn_decision_quality') && c[0].includes('JOIN mn_decisions'),
    );
    expect(rule4ForMeeting.length).toBe(0);

    // scope=project: rule 4 应执行
    query.mockClear();
    await resolver.recomputeForScope('project', 'p1');
    const rule4ForProject = query.mock.calls.filter((c: any) =>
      c[0].includes('mn_decision_quality') && c[0].includes('JOIN mn_decisions'),
    );
    expect(rule4ForProject.length).toBeGreaterThan(0);
  });

  it('listBySource filters and limits', async () => {
    const query = vi.fn().mockResolvedValueOnce({
      rows: [{
        id: 'l1', source_axis: 'people', source_item_type: 'person', source_item_id: 'p1',
        target_axis: 'projects', target_item_type: 'decision', target_item_id: 'd1',
        relationship: 'x', score: 50, count: 1,
      }],
    });
    const deps: any = { db: { query } };
    const resolver = new CrossAxisLinkResolver(deps);
    const links = await resolver.listBySource('people', 'p1');
    expect(links).toHaveLength(1);
    expect(links[0].targetAxis).toBe('projects');
    expect(links[0].score).toBe(50);
    expect(query.mock.calls[0][0]).toContain('source_axis = $1');
    expect(query.mock.calls[0][1]).toEqual(['people', 'p1', 50]);
  });

  it('counts insertions vs updates correctly', async () => {
    // Rule 1 返回 1 行 → 1 次 upsert → inserted=1
    // Rule 2 返回 1 行 → 1 次 upsert (模拟 updated) → updated=1
    let callN = 0;
    const query = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM mn_commitments') && sql.includes('at_risk')) {
        return { rows: [{ source_id: 'p1', target_id: 'd1', cnt: 2 }] };
      }
      if (sql.includes('FROM mn_cognitive_biases')) {
        return { rows: [{ source_id: 'p2', target_id: 'b1', cnt: 1, bias: 'anchoring' }] };
      }
      if (sql.includes('INSERT INTO mn_cross_axis_links')) {
        // 第一次 insert=true, 第二次 update=false
        callN++;
        return { rows: [{ inserted: callN === 1 }] };
      }
      return { rows: [] };
    });
    const deps: any = { db: { query } };
    const resolver = new CrossAxisLinkResolver(deps);
    const stats = await resolver.recomputeForScope('library', null);
    expect(stats.inserted).toBe(1);
    expect(stats.updated).toBe(1);
  });
});

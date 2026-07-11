import { describe, it, expect, vi } from 'vitest';
import { findMergeCandidatePairs } from '../../../src/modules/content-library/consolidation/autoMergeEntities.js';
import { autoMergeContentEntities } from '../../../src/modules/content-library/consolidation/autoMergeEntities.js';

describe('findMergeCandidatePairs', () => {
  it('用余弦相似自连接查询并映射对（target=较早创建者）', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        return { rows: [
          { target_id: 't1', source_id: 's1', entity_type: 'organization', similarity: 0.98 },
        ] };
      }),
    };
    const pairs = await findMergeCandidatePairs({ db } as any, 0.9, 100);
    // 相似度阈值与 limit 作为参数
    expect(calls[0].params).toEqual([0.9, 100]);
    // 余弦相似写法 + 同类型 + 非空向量 + a.id<b.id
    expect(calls[0].sql).toMatch(/1 - \(a\.embedding <=> b\.embedding\)/);
    expect(calls[0].sql).toMatch(/a\.entity_type = b\.entity_type/);
    expect(calls[0].sql).toMatch(/a\.embedding IS NOT NULL AND b\.embedding IS NOT NULL/);
    expect(calls[0].sql).toMatch(/a\.id < b\.id/);
    expect(pairs).toEqual([
      { targetId: 't1', sourceId: 's1', entityType: 'organization', similarity: 0.98 },
    ]);
  });
});

describe('autoMergeContentEntities 双档', () => {
  function makeDeps(pairsRows: any[]) {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        if (/FROM content_entities a\s+JOIN content_entities b/i.test(sql)) return { rows: pairsRows };
        if (/merge_content_entities/i.test(sql)) return { rows: [{ table_name: 'x', rows_reassigned: 0, rows_dropped: 1 }] };
        return { rows: [] };
      }),
    };
    return { deps: { db } as any, calls };
  }

  it('非 person 且 sim≥0.97 → 调 mergeContentEntities 合并', async () => {
    const { deps, calls } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'organization', similarity: 0.99 },
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(1);
    expect(r.proposed).toBe(0);
    expect(calls.some(c => /merge_content_entities/i.test(c.sql))).toBe(true);
    expect(calls.some(c => /INSERT INTO content_entity_merge_candidates/i.test(c.sql))).toBe(false);
  });

  it('person 对无论多相似 → 只进候选，不合并', async () => {
    const { deps, calls } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'person', similarity: 0.999 },
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(0);
    expect(r.proposed).toBe(1);
    expect(calls.some(c => /merge_content_entities/i.test(c.sql))).toBe(false);
    expect(calls.some(c => /INSERT INTO content_entity_merge_candidates/i.test(c.sql))).toBe(true);
  });

  it('中档相似(0.90-0.97) → 进候选', async () => {
    const { deps, calls } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'product', similarity: 0.93 },
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(0);
    expect(r.proposed).toBe(1);
    expect(calls.some(c => /INSERT INTO content_entity_merge_candidates/i.test(c.sql))).toBe(true);
  });

  it('同一 source 被上一对消费后，后续涉及它的对跳过', async () => {
    const { deps } = makeDeps([
      { target_id: 't1', source_id: 's1', entity_type: 'organization', similarity: 0.99 },
      { target_id: 't2', source_id: 's1', entity_type: 'organization', similarity: 0.98 }, // s1 已消费
    ]);
    const r = await autoMergeContentEntities(deps);
    expect(r.autoMerged).toBe(1); // 第二对跳过
  });
});

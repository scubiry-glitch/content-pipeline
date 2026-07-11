import { describe, it, expect, vi } from 'vitest';
import { findMergeCandidatePairs } from '../../../src/modules/content-library/consolidation/autoMergeEntities.js';

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

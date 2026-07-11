import { describe, it, expect, vi } from 'vitest';
import { backfillEntityEmbeddings } from '../../../src/modules/content-library/scripts/backfillEntityEmbeddings.js';

function makeDeps(rows: any[], embed: (t: string) => Promise<number[]>) {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/SELECT .* FROM content_entities/i.test(sql)) return { rows };
      return { rows: [] };
    }),
  };
  return { deps: { db, embedding: { embed: vi.fn(embed), embedBatch: vi.fn() } } as any, calls };
}

describe('backfillEntityEmbeddings', () => {
  it('对空向量行补算并 UPDATE，返回 {scanned, embedded}', async () => {
    const { deps, calls } = makeDeps(
      [{ id: 'e1', canonical_name: '腾讯' }, { id: 'e2', canonical_name: '阿里' }],
      async () => new Array(768).fill(0.2),
    );
    const r = await backfillEntityEmbeddings(deps);
    expect(r).toEqual({ scanned: 2, embedded: 2 });
    const updates = calls.filter((c) => /UPDATE content_entities SET embedding/i.test(c.sql));
    expect(updates).toHaveLength(2);
    expect(typeof updates[0].params[1]).toBe('string'); // JSON.stringify(vec)
  });

  it('embed 返回 [] （local provider）→ 跳过 UPDATE，embedded=0', async () => {
    const { deps, calls } = makeDeps([{ id: 'e1', canonical_name: '腾讯' }], async () => []);
    const r = await backfillEntityEmbeddings(deps);
    expect(r).toEqual({ scanned: 1, embedded: 0 });
    expect(calls.some((c) => /UPDATE content_entities SET embedding/i.test(c.sql))).toBe(false);
  });
});

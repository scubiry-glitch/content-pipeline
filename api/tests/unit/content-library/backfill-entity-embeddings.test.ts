import { describe, it, expect, vi } from 'vitest';
import { backfillEntityEmbeddings, reembedAllEntities } from '../../../src/modules/content-library/scripts/backfillEntityEmbeddings.js';

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

function makeBatchDeps(rows: any[], embedBatch: (texts: string[]) => Promise<number[][]>) {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/SELECT .* FROM content_entities/i.test(sql)) return { rows };
      return { rows: [] };
    }),
  };
  return { deps: { db, embedding: { embed: vi.fn(), embedBatch: vi.fn(embedBatch) } } as any, calls };
}

describe('reembedAllEntities（全量覆盖）', () => {
  it('SELECT 全部行（不带 WHERE embedding IS NULL），批量 embedBatch 后逐行 UPDATE', async () => {
    const { deps, calls } = makeBatchDeps(
      [{ id: 'e1', canonical_name: '欧莱雅' }, { id: 'e2', canonical_name: '薇姿' }],
      async (texts) => texts.map(() => new Array(768).fill(0.1)),
    );
    const r = await reembedAllEntities(deps, { batchSize: 10 });
    expect(r).toEqual({ scanned: 2, embedded: 2 });
    const sel = calls.find((c) => /SELECT .* FROM content_entities/i.test(c.sql));
    expect(sel!.sql).not.toMatch(/embedding IS NULL/i); // 全量，不是只补 NULL
    const updates = calls.filter((c) => /UPDATE content_entities SET embedding/i.test(c.sql));
    expect(updates).toHaveLength(2);
    expect(typeof updates[0].params[1]).toBe('string');
  });

  it('embedBatch 返回空向量（local/失败）→ 跳过该行不覆盖', async () => {
    const { deps, calls } = makeBatchDeps(
      [{ id: 'e1', canonical_name: '腾讯' }],
      async (texts) => texts.map(() => []),
    );
    const r = await reembedAllEntities(deps);
    expect(r).toEqual({ scanned: 1, embedded: 0 });
    expect(calls.some((c) => /UPDATE content_entities SET embedding/i.test(c.sql))).toBe(false);
  });

  it('空 canonical_name → 跳过（不覆盖）', async () => {
    const { deps } = makeBatchDeps(
      [{ id: 'e1', canonical_name: '  ' }],
      async (texts) => texts.map(() => new Array(768).fill(0.3)),
    );
    const r = await reembedAllEntities(deps);
    expect(r).toEqual({ scanned: 1, embedded: 0 });
  });
});

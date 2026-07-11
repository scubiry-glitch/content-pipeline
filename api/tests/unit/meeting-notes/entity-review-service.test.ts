import { describe, it, expect, vi } from 'vitest';
import {
  listMergeCandidates, approveMergeCandidate, rejectMergeCandidate,
} from '../../../src/modules/meeting-notes/review/entityReviewService.js';

describe('listMergeCandidates', () => {
  it('NaN limit 回退到默认值 50（有限数）', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [] };
    }) };
    await listMergeCandidates(db as any, { limit: Number('abc') });
    expect(Number.isFinite(calls[0].params[1])).toBe(true);
    expect(calls[0].params[1]).toBe(50);
  });

  it('按 status 过滤、联表取名、映射行', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [{
        id: 'c1', target_entity_id: 't1', source_entity_id: 's1', entity_type: 'organization',
        similarity: 0.95, status: 'pending', created_at: '2026-07-11',
        target_canonical_name: '腾讯', source_canonical_name: '腾讯控股',
      }] };
    }) };
    const rows = await listMergeCandidates(db as any, { status: 'pending', limit: 20 });
    expect(calls[0].sql).toMatch(/FROM content_entity_merge_candidates/i);
    expect(calls[0].sql).toMatch(/LEFT JOIN content_entities/i);
    expect(calls[0].params).toEqual(['pending', 20]);
    expect(rows[0]).toMatchObject({
      id: 'c1', targetEntityId: 't1', sourceEntityId: 's1', entityType: 'organization',
      similarity: 0.95, status: 'pending', targetName: '腾讯', sourceName: '腾讯控股',
    });
  });
});

describe('approveMergeCandidate', () => {
  it('非 person → 调 merge_content_entities 并置 approved', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/SELECT .* FROM content_entity_merge_candidates WHERE id/i.test(sql))
        return { rows: [{ id: 'c1', target_entity_id: 't1', source_entity_id: 's1', entity_type: 'product' }] };
      if (/merge_content_entities/i.test(sql))
        return { rows: [{ table_name: 'x', rows_reassigned: 1, rows_dropped: 1 }] };
      return { rows: [] };
    }) };
    const r = await approveMergeCandidate(db as any, 'c1');
    expect(r.approved).toBe(true);
    expect(r.entityType).toBe('product');
    expect(calls.some(c => /merge_content_entities/i.test(c.sql))).toBe(true);
    expect(calls.some(c => /UPDATE content_entity_merge_candidates\s+SET status = 'approved'/i.test(c.sql))).toBe(true);
  });

  it('person 候选 → 抛 PERSON_MERGE_MANUAL，不合并', async () => {
    const db = { query: vi.fn(async (sql: string) => {
      if (/FROM content_entity_merge_candidates WHERE id/i.test(sql))
        return { rows: [{ id: 'c1', target_entity_id: 't1', source_entity_id: 's1', entity_type: 'person' }] };
      return { rows: [] };
    }) };
    await expect(approveMergeCandidate(db as any, 'c1')).rejects.toMatchObject({ code: 'PERSON_MERGE_MANUAL' });
    expect(db.query).not.toHaveBeenCalledWith(expect.stringMatching(/merge_content_entities/i), expect.anything());
  });

  it('候选不存在 → 抛 NOT_FOUND', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(approveMergeCandidate(db as any, 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('rejectMergeCandidate', () => {
  it('置 rejected；命中返回 true', async () => {
    const db = { query: vi.fn(async () => ({ rows: [{ id: 'c1' }] })) };
    expect(await rejectMergeCandidate(db as any, 'c1')).toBe(true);
  });
  it('未命中返回 false', async () => {
    const db = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await rejectMergeCandidate(db as any, 'x')).toBe(false);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  listUnresolvedMentions, resolveUnresolvedMention,
} from '../../../src/modules/meeting-notes/review/unresolvedReviewService.js';

describe('listUnresolvedMentions', () => {
  it('按 status 过滤、按 occurrences 排序、映射行', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [{
        id: 'u1', meeting_id: 'm1', raw_name: '张总', normalized_name: '张总',
        occurrences: 3, status: 'pending', created_at: '2026-07-11',
      }] };
    }) };
    const rows = await listUnresolvedMentions(db as any, { status: 'pending', limit: 50 });
    expect(calls[0].sql).toMatch(/FROM mn_unresolved_mentions/i);
    expect(calls[0].sql).toMatch(/ORDER BY occurrences DESC/i);
    expect(calls[0].params).toEqual(['pending', 50]);
    expect(rows[0]).toMatchObject({ id: 'u1', meetingId: 'm1', rawName: '张总', occurrences: 3, status: 'pending' });
  });
});

describe('resolveUnresolvedMention', () => {
  it('置 resolved；命中 true / 未命中 false', async () => {
    const hit = { query: vi.fn(async () => ({ rows: [{ id: 'u1' }] })) };
    expect(await resolveUnresolvedMention(hit as any, 'u1')).toBe(true);
    const miss = { query: vi.fn(async () => ({ rows: [] })) };
    expect(await resolveUnresolvedMention(miss as any, 'x')).toBe(false);
  });
});

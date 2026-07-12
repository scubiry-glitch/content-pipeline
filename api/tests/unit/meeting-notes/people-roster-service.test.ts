import { describe, it, expect, vi } from 'vitest';
import { listPeopleRoster } from '../../../src/modules/meeting-notes/review/peopleRosterService.js';

describe('listPeopleRoster', () => {
  it('列 mn_people、映射 camelCase + bridged、无 q 时 param 为 null、limit 夹取', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [
        { id: 'p1', canonical_name: '张伟', aliases: ['张总'], role: 'CTO', org: 'A', content_entity_id: 'ce1', workspace_id: 'w1', created_at: '2026-07-12' },
        { id: 'p2', canonical_name: '李四', aliases: [], role: null, org: null, content_entity_id: null, workspace_id: 'w1', created_at: '2026-07-12' },
      ] };
    }) };
    const rows = await listPeopleRoster(db as any, { limit: 9999 });
    expect(calls[0].sql).toMatch(/FROM mn_people/i);
    expect(calls[0].params).toEqual([500, null]); // limit 夹到 500，q=null
    expect(rows[0]).toMatchObject({ id: 'p1', canonicalName: '张伟', aliases: ['张总'], contentEntityId: 'ce1', bridged: true });
    expect(rows[1]).toMatchObject({ id: 'p2', bridged: false, role: null, org: null });
  });

  it('有 q 时按名字/别名模糊过滤（q 作为 param 传入）', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => { calls.push({ sql, params }); return { rows: [] }; }) };
    await listPeopleRoster(db as any, { q: '张', limit: 50 });
    expect(calls[0].params).toEqual([50, '张']);
    expect(calls[0].sql).toMatch(/ILIKE/i);
    expect(calls[0].sql).toMatch(/unnest\(aliases\)/i);
  });
});

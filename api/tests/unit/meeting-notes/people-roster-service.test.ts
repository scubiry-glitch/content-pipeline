import { describe, it, expect, vi } from 'vitest';
import { listPeopleRoster } from '../../../src/modules/meeting-notes/review/peopleRosterService.js';

function mkDb(rows: any[]) {
  const calls: { sql: string; params: any[] }[] = [];
  const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (/count\(\*\)/i.test(sql)) return { rows: [{ total: 42 }] };
    return { rows };
  }) };
  return { db, calls };
}

describe('listPeopleRoster', () => {
  it('列 mn_people、映射 camelCase + bridged、无 q 时 param 为 null、limit 夹取、返回真实 total', async () => {
    const { db, calls } = mkDb([
      { id: 'p1', canonical_name: '张伟', aliases: ['张总'], role: 'CTO', org: 'A', content_entity_id: 'ce1', workspace_id: 'w1', created_at: '2026-07-12' },
      { id: 'p2', canonical_name: '李四', aliases: [], role: null, org: null, content_entity_id: null, workspace_id: 'w1', created_at: '2026-07-12' },
    ]);
    const r = await listPeopleRoster(db as any, { limit: 9999 });
    const listCall = calls.find((c) => /LIMIT/i.test(c.sql))!;
    expect(listCall.sql).toMatch(/FROM mn_people/i);
    expect(listCall.params).toEqual([2000, null]); // limit 夹到 2000，q=null
    expect(r.total).toBe(42); // 来自独立 count 查询，不受 limit 截断
    expect(r.items[0]).toMatchObject({ id: 'p1', canonicalName: '张伟', aliases: ['张总'], contentEntityId: 'ce1', bridged: true });
    expect(r.items[1]).toMatchObject({ id: 'p2', bridged: false, role: null, org: null });
  });

  it('有 q 时按名字/别名模糊过滤，list 与 count 都带 q', async () => {
    const { db, calls } = mkDb([]);
    await listPeopleRoster(db as any, { q: '张', limit: 50 });
    const listCall = calls.find((c) => /LIMIT/i.test(c.sql))!;
    const countCall = calls.find((c) => /count\(\*\)/i.test(c.sql))!;
    expect(listCall.params).toEqual([50, '张']);
    expect(listCall.sql).toMatch(/ILIKE/i);
    expect(listCall.sql).toMatch(/unnest\(aliases\)/i);
    expect(countCall.params).toEqual(['张']); // count 只吃 q
    expect(countCall.sql).toMatch(/ILIKE/i);
  });
});

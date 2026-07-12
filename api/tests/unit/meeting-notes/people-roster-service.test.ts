import { describe, it, expect, vi } from 'vitest';
import { listPeopleRoster, getPersonMeetings } from '../../../src/modules/meeting-notes/review/peopleRosterService.js';

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
  it('映射 camelCase + bridged + personKind、limit/offset 夹取、默认排除硬 junk、返回真实 total', async () => {
    const { db, calls } = mkDb([
      { id: 'p1', canonical_name: '张伟', aliases: ['张总'], role: 'CTO', org: 'A', content_entity_id: 'ce1', person_kind: 'person', workspace_id: 'w1', created_at: '2026-07-12' },
      { id: 'p2', canonical_name: '李四', aliases: [], role: null, org: null, content_entity_id: null, person_kind: 'unclear', workspace_id: 'w1', created_at: '2026-07-12' },
    ]);
    const r = await listPeopleRoster(db as any, { limit: 9999, offset: 20 });
    const listCall = calls.find((c) => /LIMIT/i.test(c.sql))!;
    expect(listCall.params).toEqual([2000, 20, null]); // limit 夹到 2000, offset 20, q=null
    expect(listCall.sql).toMatch(/OFFSET \$2/i);
    expect(listCall.sql).toMatch(/is_person'\) IS DISTINCT FROM 'false'/); // 默认排除硬 junk
    expect(r.total).toBe(42);
    expect(r.items[0]).toMatchObject({ id: 'p1', canonicalName: '张伟', bridged: true, personKind: 'person' });
    expect(r.items[1]).toMatchObject({ id: 'p2', bridged: false, personKind: 'unclear' });
  });

  it('kind 过滤：list 与 count 都带 person_kind 条件与参数', async () => {
    const { db, calls } = mkDb([]);
    await listPeopleRoster(db as any, { kind: 'person', limit: 50 });
    const listCall = calls.find((c) => /LIMIT/i.test(c.sql))!;
    const countCall = calls.find((c) => /count\(\*\)/i.test(c.sql))!;
    expect(listCall.params).toEqual([50, 0, null, 'person']);
    expect(listCall.sql).toMatch(/person_kind' = \$4/);
    expect(countCall.params).toEqual([null, 'person']);
    expect(countCall.sql).toMatch(/person_kind' = \$2/);
  });

  it('includeJunk=true 时不加 is_person 过滤；q 模糊按名字/别名', async () => {
    const { db, calls } = mkDb([]);
    await listPeopleRoster(db as any, { q: '张', includeJunk: true });
    const listCall = calls.find((c) => /LIMIT/i.test(c.sql))!;
    expect(listCall.sql).not.toMatch(/is_person/);
    expect(listCall.sql).toMatch(/ILIKE/i);
    expect(listCall.sql).toMatch(/unnest\(aliases\)/i);
    expect(listCall.params[2]).toBe('张');
  });
});

describe('getPersonMeetings', () => {
  it('UNION 事实表取该人会议、join assets 取标题、映射 id/title/date', async () => {
    const calls: any[] = [];
    const db = { query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      return { rows: [
        { id: 'm1', title: '战略会', created_at: '2026-06-01T00:00:00Z' },
        { id: 'm2', title: '未命名会议', created_at: null },
      ] };
    }) };
    const r = await getPersonMeetings(db as any, 'p1');
    expect(calls[0].params).toEqual(['p1']);
    expect(calls[0].sql).toMatch(/mn_commitments/);
    expect(calls[0].sql).toMatch(/first_seen_meeting_id/);
    expect(calls[0].sql).toMatch(/LEFT JOIN assets/i);
    expect(r).toEqual([
      { id: 'm1', title: '战略会', date: '2026-06-01T00:00:00Z' },
      { id: 'm2', title: '未命名会议', date: null },
    ]);
  });
});

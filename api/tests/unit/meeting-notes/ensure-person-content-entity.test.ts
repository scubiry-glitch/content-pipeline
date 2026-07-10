import { describe, it, expect, vi } from 'vitest';
import { ensurePersonByName } from '../../../src/modules/meeting-notes/parse/participantExtractor.js';

function makeDeps() {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: vi.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // content_entities 解析：先查不到，再 INSERT 返回 id
      if (/FROM content_entities/i.test(sql)) return { rows: [] };
      if (/INSERT INTO content_entities/i.test(sql)) return { rows: [{ id: 'ce-1', canonical_name: '张伟', aliases: [], entity_type: 'person' }] };
      // mn_people 查重：不存在
      if (/SELECT id FROM mn_people/i.test(sql)) return { rows: [] };
      // mn_people 插入：返回 id
      if (/INSERT INTO mn_people/i.test(sql)) return { rows: [{ id: 'mp-1' }] };
      return { rows: [] };
    }),
  };
  const embedding = { embed: vi.fn(async () => new Array(768).fill(0)) };
  return { deps: { db, embedding } as any, calls };
}

describe('ensurePersonByName · content_entity 桥接', () => {
  it('注册 content_entities 并把 content_entity_id 写进 mn_people INSERT', async () => {
    const { deps, calls } = makeDeps();
    const id = await ensurePersonByName(deps, '张伟', undefined, undefined, 'meeting-1');
    expect(id).toBe('mp-1');

    const insertPerson = calls.find(c => /INSERT INTO mn_people/i.test(c.sql));
    expect(insertPerson).toBeTruthy();
    expect(insertPerson!.sql).toMatch(/content_entity_id/);
    expect(insertPerson!.params).toContain('ce-1');
  });

  it('已存在 mn_people 时也回填 content_entity_id', async () => {
    const { deps, calls } = makeDeps();
    (deps.db.query as any).mockImplementation(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (/FROM content_entities/i.test(sql)) return { rows: [{ id: 'ce-9', canonical_name: '张伟', aliases: [], entity_type: 'person' }] };
      if (/SELECT id FROM mn_people/i.test(sql)) return { rows: [{ id: 'mp-9' }] };
      return { rows: [] };
    });
    const id = await ensurePersonByName(deps, '张伟', undefined, undefined, 'meeting-1');
    expect(id).toBe('mp-9');
    const backfill = calls.find(c => /UPDATE mn_people SET content_entity_id/i.test(c.sql));
    expect(backfill).toBeTruthy();
    expect(backfill!.params).toContain('ce-9');
  });
});

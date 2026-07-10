import { describe, it, expect, vi } from 'vitest';
import { backfillPeopleContentEntity } from '../../../src/modules/meeting-notes/scripts/backfillPeopleContentEntity.js';

describe('backfillPeopleContentEntity', () => {
  it('为每条缺失 content_entity_id 的 person 解析并回填', async () => {
    const updates: any[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        if (/SELECT id, canonical_name, aliases FROM mn_people/i.test(sql))
          return { rows: [
            { id: 'mp-1', canonical_name: '张伟', aliases: [] },
            { id: 'mp-2', canonical_name: '李娜', aliases: ['小李'] },
          ] };
        if (/FROM content_entities/i.test(sql)) return { rows: [] };
        if (/INSERT INTO content_entities/i.test(sql))
          return { rows: [{ id: `ce-${params[0]}`, canonical_name: params[0], aliases: [], entity_type: 'person' }] };
        if (/UPDATE mn_people SET content_entity_id/i.test(sql)) { updates.push(params); return { rows: [] }; }
        return { rows: [] };
      }),
    };
    const embedding = { embed: vi.fn(async () => new Array(768).fill(0)) };
    const deps: any = { db, embedding };

    const res = await backfillPeopleContentEntity(deps);
    expect(res).toEqual({ scanned: 2, linked: 2 });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual(['mp-1', 'ce-张伟']);
  });
});

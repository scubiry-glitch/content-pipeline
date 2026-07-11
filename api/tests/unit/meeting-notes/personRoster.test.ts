import { describe, it, expect, vi } from 'vitest';
import { PersonRoster } from '../../../src/modules/meeting-notes/runs/personRoster.js';

function depsWithMembers(rows: any[]) {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (/FROM mn_people/i.test(sql)) return { rows };
      return { rows: [] };
    }),
  };
  const embedding = { embed: vi.fn(async () => new Array(768).fill(0)), embedBatch: vi.fn() };
  return { db, embedding } as any;
}

describe('PersonRoster', () => {
  it('build 载入 workspace 成员并按 canonical 精确解析', async () => {
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '张伟', aliases: ['张总'], content_entity_id: 'ce-1', embedding: null },
    ]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.size).toBe(1);
    expect(roster.resolve('张伟')).toBe('mp-1');
  });

  it('alias 命中', async () => {
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '张伟', aliases: ['张总', '张总监'], content_entity_id: null, embedding: null },
    ]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.resolve('张总监')).toBe('mp-1');
  });

  it('embedding 余弦命中（mock 向量）', async () => {
    const vec = (n: number) => { const a = new Array(768).fill(0); a[0] = n; return a; };
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '王芳', aliases: [], content_entity_id: 'ce-9', embedding: JSON.stringify(vec(1)) },
    ]);
    (deps.embedding.embed as any).mockResolvedValue(vec(1)); // query 名字 embed 与成员同向
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(await roster.resolveAsync('小王')).toBe('mp-1');
  });

  it('命不中：不返回 id、记入 unresolved、绝不 INSERT mn_people', async () => {
    const deps = depsWithMembers([
      { id: 'mp-1', canonical_name: '张伟', aliases: [], content_entity_id: null, embedding: null },
    ]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.resolve('陌生人')).toBeNull();
    expect(roster.unresolved).toEqual([{ normalized: '陌生人', raw: '陌生人', count: 1 }]);
    const inserted = (deps.db.query as any).mock.calls.some((c: any[]) => /INSERT INTO mn_people/i.test(c[0]));
    expect(inserted).toBe(false);
  });

  it('空名归一为空 → 返回 null 且不记 unresolved', async () => {
    const deps = depsWithMembers([]);
    const roster = await PersonRoster.build(deps, 'meeting-1');
    expect(roster.resolve('（列席）')).toBeNull();
    expect(roster.unresolved).toEqual([]);
  });
});

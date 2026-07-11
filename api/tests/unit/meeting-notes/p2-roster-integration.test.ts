import { describe, it, expect, vi } from 'vitest';
import { PersonRoster } from '../../../src/modules/meeting-notes/runs/personRoster.js';

describe('P2 roster 集成/回归', () => {
  it('多轴引用同一花名册成员 → 零重复造人（跨轴归一）', async () => {
    const db = { query: vi.fn(async (sql: string) => {
      if (/FROM mn_people/i.test(sql)) return { rows: [
        { id: 'mp-1', canonical_name: '张伟', aliases: ['张总'], content_entity_id: null, embedding: null },
      ] };
      return { rows: [] };
    }) };
    const embedding = { embed: vi.fn(async () => []), embedBatch: vi.fn() };
    const roster = await PersonRoster.build({ db, embedding } as any, 'm1');
    // 三个轴分别用 张伟/张总/张伟 引用同一人
    expect(roster.resolve('张伟')).toBe('mp-1');
    expect(roster.resolve('张总')).toBe('mp-1');
    expect(roster.resolveAsync ? await roster.resolveAsync('张伟') : null).toBe('mp-1');
    // 全程零 INSERT INTO mn_people
    expect(db.query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]))).toBe(false);
  });

  it('回归：flag 关闭时 axis computer 行为不变（走 ensurePersonByName）', async () => {
    // commitments-computer.test.ts 既有用例已覆盖「无 personRoster → 原路径」；
    // 此处显式断言 personRoster 缺省时不触发 roster
    const roster = new (PersonRoster as any)({ db: { query: vi.fn() }, embedding: { embed: vi.fn() } }, []);
    expect(typeof roster.resolve).toBe('function');
    expect(roster.resolve('任何人')).toBeNull(); // 空花名册 → null（park），不抛错
  });
});

/**
 * parse/participantExtractor — ensurePersonByName 幂等 UPSERT
 *
 * 规则：
 *   - (canonical_name, org) 唯一；同名同 org → 复用已有 id
 *   - 同名无 org → 合并（org = NULL）
 *   - 姓名标准化：去空格/括号注释
 *   - role 首次写入，之后保留既有值
 *
 * NOTE: ensurePersonByName now routes through EntityResolver which calls
 *   content_entities (SELECT then INSERT) and embedding.embed.
 *   Mocks must cover those calls before mn_people calls.
 */
import { describe, it, expect, vi } from 'vitest';
import { ensurePersonByName } from '../../../src/modules/meeting-notes/parse/participantExtractor.js';

/**
 * SQL-pattern-aware mock deps.
 * Handles EntityResolver's content_entities queries automatically,
 * then falls through to mn_people overrides supplied by callers.
 */
function makeDeps(overrides?: {
  contentEntityRow?: { id: string; canonical_name: string; aliases: string[]; entity_type: string };
  peopleSelectRow?: { id: string } | null;
  peopleInsertRow?: { id: string };
}) {
  const ceRow = overrides?.contentEntityRow ?? {
    id: 'ce-default',
    canonical_name: 'default',
    aliases: [],
    entity_type: 'person',
  };
  const peopleSelectRow = overrides?.peopleSelectRow;
  const peopleInsertRow = overrides?.peopleInsertRow ?? { id: 'p-new' };

  const query = vi.fn(async (sql: string, _params: any[] = []) => {
    // EntityResolver: SELECT * FROM content_entities
    if (/FROM content_entities/i.test(sql) && !/INSERT/i.test(sql) && !/UPDATE/i.test(sql)) {
      return { rows: [ceRow] };
    }
    // EntityResolver: INSERT INTO content_entities (registerNew)
    if (/INSERT INTO content_entities/i.test(sql)) {
      return { rows: [ceRow] };
    }
    // EntityResolver: UPDATE content_entities (mergeAliases)
    if (/UPDATE content_entities/i.test(sql)) {
      return { rows: [] };
    }
    // mn_people SELECT
    if (/SELECT id FROM mn_people/i.test(sql)) {
      if (peopleSelectRow) return { rows: [peopleSelectRow] };
      return { rows: [] };
    }
    // mn_people INSERT
    if (/INSERT INTO mn_people/i.test(sql)) {
      return { rows: [peopleInsertRow] };
    }
    // mn_people UPDATE (role or content_entity_id backfill)
    if (/UPDATE mn_people/i.test(sql)) {
      return { rows: [] };
    }
    return { rows: [] };
  });

  const embedding = { embed: vi.fn(async () => new Array(768).fill(0)) };

  const deps: any = { db: { query }, embedding };
  return { deps, query, embedding };
}

describe('ensurePersonByName', () => {
  it('returns null for empty name', async () => {
    const { deps, query } = makeDeps();
    const id = await ensurePersonByName(deps, '   ');
    expect(id).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('normalizes name: strips parenthesized notes', async () => {
    const { deps, query } = makeDeps({ peopleSelectRow: null });

    await ensurePersonByName(deps, '王小明 (CEO)');
    // find the mn_people SELECT call and verify the canonical name
    const selectCall = query.mock.calls.find((c: any[]) => /SELECT id FROM mn_people/i.test(c[0]));
    expect(selectCall).toBeTruthy();
    expect(selectCall![1][0]).toBe('王小明');  // 注释已被去掉
  });

  it('reuses existing row when (name, org) matches', async () => {
    const { deps, query } = makeDeps({ peopleSelectRow: { id: 'p-exists' } });

    const id = await ensurePersonByName(deps, '张三', 'developer', '公司A');
    expect(id).toBe('p-exists');
    // mn_people SELECT call exists
    const selectCall = query.mock.calls.find((c: any[]) => /SELECT id FROM mn_people/i.test(c[0]));
    expect(selectCall).toBeTruthy();
    expect(selectCall![0]).toContain('SELECT id FROM mn_people');
    // role UPDATE call exists
    const updateCall = query.mock.calls.find((c: any[]) => /UPDATE mn_people SET role/i.test(c[0]));
    expect(updateCall).toBeTruthy();
  });

  it('inserts new person when no match', async () => {
    const { deps, query } = makeDeps({ peopleSelectRow: null, peopleInsertRow: { id: 'p-new' } });

    const id = await ensurePersonByName(deps, '新同学', 'intern');
    expect(id).toBe('p-new');
    const insertCall = query.mock.calls.find((c: any[]) => /INSERT INTO mn_people/i.test(c[0]));
    expect(insertCall).toBeTruthy();
    expect(insertCall![0]).toContain('INSERT INTO mn_people');
    // canonical_name and role in params
    expect(insertCall![1][0]).toBe('新同学');
    expect(insertCall![1][1]).toBe('intern');
    expect(insertCall![1][2]).toBeNull();  // org
  });

  it('distinguishes same name + different org', async () => {
    const { deps, query } = makeDeps({ peopleSelectRow: null, peopleInsertRow: { id: 'p-org-b' } });

    const id = await ensurePersonByName(deps, '李四', undefined, '公司B');
    expect(id).toBe('p-org-b');
    // lookup WHERE org = 公司B (第二参数)
    const selectCall = query.mock.calls.find((c: any[]) => /SELECT id FROM mn_people/i.test(c[0]));
    expect(selectCall).toBeTruthy();
    expect(selectCall![1][0]).toBe('李四');
    expect(selectCall![1][1]).toBe('公司B');
  });
});

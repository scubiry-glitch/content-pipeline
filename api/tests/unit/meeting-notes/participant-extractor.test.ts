/**
 * parse/participantExtractor — ensurePersonByName 幂等 UPSERT
 *
 * 规则：
 *   - (canonical_name, org) 唯一；同名同 org → 复用已有 id
 *   - 同名无 org → 合并（org = NULL）
 *   - 姓名标准化：去空格/括号注释
 *   - role 首次写入，之后保留既有值
 */
import { describe, it, expect, vi } from 'vitest';
import { ensurePersonByName } from '../../../src/modules/meeting-notes/parse/participantExtractor.js';

function makeDeps() {
  const query = vi.fn();
  const deps: any = {
    db: { query },
    // 其他字段留空，ensurePersonByName 只用 db
  };
  return { deps, query };
}

describe('ensurePersonByName', () => {
  it('returns null for empty name', async () => {
    const { deps, query } = makeDeps();
    const id = await ensurePersonByName(deps, '   ');
    expect(id).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('normalizes name: strips parenthesized notes', async () => {
    const { deps, query } = makeDeps();
    query
      .mockResolvedValueOnce({ rows: [] })                 // lookup miss
      .mockResolvedValueOnce({ rows: [{ id: 'p-1' }] });  // insert

    await ensurePersonByName(deps, '王小明 (CEO)');
    const selectCall = query.mock.calls[0];
    expect(selectCall[1][0]).toBe('王小明');  // 注释已被去掉
  });

  it('reuses existing row when (name, org) matches', async () => {
    const { deps, query } = makeDeps();
    query.mockResolvedValueOnce({ rows: [{ id: 'p-exists' }] });  // lookup hit
    // no insert expected

    const id = await ensurePersonByName(deps, '张三', 'developer', '公司A');
    expect(id).toBe('p-exists');
    // 只有 lookup + 可选 role 更新 = 2 次调用
    expect(query.mock.calls[0][0]).toContain('SELECT id FROM mn_people');
    expect(query.mock.calls[1][0]).toContain('UPDATE mn_people');
  });

  it('inserts new person when no match', async () => {
    const { deps, query } = makeDeps();
    query
      .mockResolvedValueOnce({ rows: [] })                 // miss
      .mockResolvedValueOnce({ rows: [{ id: 'p-new' }] }); // insert

    const id = await ensurePersonByName(deps, '新同学', 'intern');
    expect(id).toBe('p-new');
    expect(query.mock.calls[1][0]).toContain('INSERT INTO mn_people');
    expect(query.mock.calls[1][1]).toEqual(['新同学', 'intern', null]);
  });

  it('distinguishes same name + different org', async () => {
    const { deps, query } = makeDeps();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'p-org-b' }] });

    const id = await ensurePersonByName(deps, '李四', undefined, '公司B');
    expect(id).toBe('p-org-b');
    // lookup WHERE org = 公司B (第二参数)
    expect(query.mock.calls[0][1]).toEqual(['李四', '公司B']);
  });
});

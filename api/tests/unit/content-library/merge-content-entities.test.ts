import { describe, it, expect, vi } from 'vitest';
import { mergeContentEntities } from '../../../src/modules/content-library/consolidation/mergeEntities.js';

describe('mergeContentEntities', () => {
  it('调用 SQL 函数并映射审计行', async () => {
    const calls: { sql: string; params: any[] }[] = [];
    const db = {
      query: vi.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        return { rows: [
          { table_name: 'content_entity_relations', rows_reassigned: 3, rows_dropped: 1 },
          { table_name: 'mn_people', rows_reassigned: 2, rows_dropped: 0 },
          { table_name: 'content_entities (source deleted)', rows_reassigned: 0, rows_dropped: 1 },
        ] };
      }),
    };
    const rows = await mergeContentEntities({ db } as any, 'tgt-1', 'src-1');
    // 调了合并函数，带 target/source 参数
    expect(calls[0].sql).toMatch(/merge_content_entities\(\$1::uuid, \$2::uuid\)/);
    expect(calls[0].params).toEqual(['tgt-1', 'src-1']);
    // 映射成 {table, reassigned, dropped}
    expect(rows).toEqual([
      { table: 'content_entity_relations', reassigned: 3, dropped: 1 },
      { table: 'mn_people', reassigned: 2, dropped: 0 },
      { table: 'content_entities (source deleted)', reassigned: 0, dropped: 1 },
    ]);
  });
});

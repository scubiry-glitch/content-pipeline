import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

function sql(): string {
  const p = fileURLToPath(new URL(
    '../../../src/modules/meeting-notes/migrations/033-merge-content-entities.sql', import.meta.url));
  return readFileSync(p, 'utf8');
}

describe('033-merge-content-entities migration', () => {
  it('已登记进 FILES 列表', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('033-merge-content-entities.sql');
  });
  it('定义 merge_content_entities 函数并返回审计 TABLE', () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION merge_content_entities\(target_id UUID, source_id UUID\)/);
    expect(s).toMatch(/RETURNS TABLE\s*\(\s*table_name VARCHAR/);
  });
  it('校验 target≠source 且两者存在', () => {
    const s = sql();
    expect(s).toMatch(/IF target_id = source_id THEN/);
    expect(s).toMatch(/22023/);
    expect(s).toMatch(/02000/);
    expect(s).toMatch(/FOR UPDATE/);
  });
  it('重指向 content_entity_relations 两侧且处理 UNIQUE 冲突/自环', () => {
    const s = sql();
    expect(s).toMatch(/UPDATE content_entity_relations SET entity_a_id = target_id WHERE entity_a_id = source_id/);
    expect(s).toMatch(/UPDATE content_entity_relations SET entity_b_id = target_id WHERE entity_b_id = source_id/);
    // 自环删除：source↔target 直接配对
    expect(s).toMatch(/entity_a_id = source_id AND entity_b_id = target_id/);
  });
  it('重指向 mn_people.content_entity_id 且删除 source 实体', () => {
    const s = sql();
    expect(s).toMatch(/UPDATE mn_people SET content_entity_id = target_id WHERE content_entity_id = source_id/);
    expect(s).toMatch(/DELETE FROM content_entities WHERE id = source_id/);
  });
  it('合并 aliases（含 source canonical，去重排除 target canonical）', () => {
    const s = sql();
    expect(s).toMatch(/ARRAY\[source_canonical\]/);
    expect(s).toMatch(/a <> target_canonical/);
  });
});

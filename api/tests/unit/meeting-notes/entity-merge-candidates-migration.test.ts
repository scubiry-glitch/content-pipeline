import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

function sql(): string {
  const p = fileURLToPath(new URL(
    '../../../src/modules/meeting-notes/migrations/034-entity-merge-candidates.sql', import.meta.url));
  return readFileSync(p, 'utf8');
}

describe('034-entity-merge-candidates migration', () => {
  it('已登记进 FILES', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('034-entity-merge-candidates.sql');
  });
  it('建候选表且 (target, source) 唯一', () => {
    const s = sql();
    expect(s).toMatch(/CREATE TABLE IF NOT EXISTS content_entity_merge_candidates/);
    expect(s).toMatch(/UNIQUE \(target_entity_id, source_entity_id\)/);
    expect(s).toMatch(/similarity\s+DOUBLE PRECISION NOT NULL/);
    expect(s).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pending'/);
  });
});

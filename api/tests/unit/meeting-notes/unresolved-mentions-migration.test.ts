import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

describe('032-unresolved-mentions migration', () => {
  it('已登记进 FILES 列表', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('032-unresolved-mentions.sql');
  });
  it('建表且 (meeting_id, normalized_name) 唯一', () => {
    const p = fileURLToPath(new URL(
      '../../../src/modules/meeting-notes/migrations/032-unresolved-mentions.sql', import.meta.url));
    const sql = readFileSync(p, 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS mn_unresolved_mentions/);
    expect(sql).toMatch(/UNIQUE \(meeting_id, normalized_name\)/);
  });
});

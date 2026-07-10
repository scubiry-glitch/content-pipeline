import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

const MIG_DIR = join(process.cwd(), 'src/modules/meeting-notes/migrations');

describe('migration 030 · mn_people.content_entity_id', () => {
  it('is registered in FILES array', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('030-people-content-entity-link.sql');
  });

  it('sql adds nullable content_entity_id FK to content_entities', () => {
    const sql = readFileSync(join(MIG_DIR, '030-people-content-entity-link.sql'), 'utf8');
    expect(sql).toMatch(/ALTER TABLE mn_people/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS content_entity_id UUID/i);
    expect(sql).toMatch(/REFERENCES content_entities\s*\(\s*id\s*\)/i);
    expect(existsSync(join(MIG_DIR, '030-people-content-entity-link.sql'))).toBe(true);
  });
});

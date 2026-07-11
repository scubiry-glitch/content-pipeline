import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MEETING_NOTES_MIGRATION_FILES } from '../../../src/db/ensureMeetingNotesSchema.js';

const MIG_DIR = join(process.cwd(), 'src/modules/meeting-notes/migrations');

describe('migration 031 · merge 归一 content_entity_id', () => {
  it('registered', () => {
    expect(MEETING_NOTES_MIGRATION_FILES).toContain('031-merge-content-entity-link.sql');
  });
  it('CREATE OR REPLACE mn_merge_people 且触及 content_entity_id', () => {
    const sql = readFileSync(join(MIG_DIR, '031-merge-content-entity-link.sql'), 'utf8');
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION mn_merge_people/i);
    expect(sql).toMatch(/content_entity_id/);
  });
});

/**
 * Migration 028 - meeting-note-sources schema
 * Validates the canonical SQL file + the inlined DDL in connection.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../src/db/migrations/028-meeting-note-sources.sql',
);
const CONNECTION_PATH = resolve(
  __dirname,
  '../../src/db/connection.ts',
);

describe('Migration 028: meeting_note_sources', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');

  describe('meeting_note_sources table', () => {
    it('creates meeting_note_sources table', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS meeting_note_sources/);
    });

    it('restricts kind to the six supported channels', () => {
      expect(sql).toMatch(
        /CHECK\s*\(\s*kind IN\s*\(\s*'lark'\s*,\s*'zoom'\s*,\s*'teams'\s*,\s*'upload'\s*,\s*'folder'\s*,\s*'manual'\s*\)\s*\)/,
      );
    });

    it('has JSONB config with non-null default', () => {
      expect(sql).toMatch(/config JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    });

    it('has is_active and schedule_cron columns', () => {
      expect(sql).toMatch(/is_active BOOLEAN NOT NULL DEFAULT TRUE/);
      expect(sql).toMatch(/schedule_cron VARCHAR\(64\)/);
    });

    it('tracks created_by / created_at / updated_at', () => {
      expect(sql).toMatch(/created_by UUID/);
      expect(sql).toMatch(/created_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
      expect(sql).toMatch(/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
    });
  });

  describe('meeting_note_imports table', () => {
    it('creates meeting_note_imports table', () => {
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS meeting_note_imports/);
    });

    it('references sources with CASCADE delete', () => {
      expect(sql).toMatch(
        /source_id UUID NOT NULL\s*REFERENCES meeting_note_sources\(id\) ON DELETE CASCADE/,
      );
    });

    it('constrains status to the five job states', () => {
      expect(sql).toMatch(
        /CHECK\s*\(\s*status IN\s*\(\s*'pending'\s*,\s*'running'\s*,\s*'succeeded'\s*,\s*'failed'\s*,\s*'partial'\s*\)\s*\)/,
      );
    });

    it('carries counters for discovered / imported / duplicates / errors', () => {
      expect(sql).toMatch(/items_discovered INT NOT NULL DEFAULT 0/);
      expect(sql).toMatch(/items_imported\s+INT NOT NULL DEFAULT 0/);
      expect(sql).toMatch(/duplicates\s+INT NOT NULL DEFAULT 0/);
      expect(sql).toMatch(/errors\s+INT NOT NULL DEFAULT 0/);
    });

    it('records asset_ids as a UUID array for reverse lookup', () => {
      expect(sql).toMatch(
        /asset_ids\s+UUID\[\] NOT NULL DEFAULT ARRAY\[\]::uuid\[\]/,
      );
    });

    it('records triggered_by source of the run', () => {
      expect(sql).toMatch(
        /triggered_by\s+VARCHAR\(32\) NOT NULL DEFAULT 'manual'/,
      );
    });
  });

  describe('indexes & triggers', () => {
    it('adds active+kind lookup index on sources', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_meeting_note_sources_active[\s\S]+is_active, kind/,
      );
    });

    it('adds source-scoped history index on imports', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_meeting_note_imports_source[\s\S]+source_id, started_at DESC/,
      );
    });

    it('adds partial index for in-flight jobs only', () => {
      expect(sql).toMatch(
        /CREATE INDEX IF NOT EXISTS idx_meeting_note_imports_active[\s\S]+WHERE status IN \('pending','running'\)/,
      );
    });

    it('installs updated_at trigger reusing update_updated_at_column()', () => {
      expect(sql).toMatch(
        /CREATE TRIGGER trg_meeting_note_sources_updated_at[\s\S]+EXECUTE FUNCTION update_updated_at_column\(\)/,
      );
    });
  });

  describe('connection.ts parity', () => {
    // The runtime creates tables via setupMVPSchema in connection.ts;
    // migration .sql files are the canonical reference. Both must exist.
    const conn = readFileSync(CONNECTION_PATH, 'utf8');

    it('inlines meeting_note_sources DDL in setupMVPSchema', () => {
      expect(conn).toMatch(/CREATE TABLE IF NOT EXISTS meeting_note_sources/);
    });

    it('inlines meeting_note_imports DDL in setupMVPSchema', () => {
      expect(conn).toMatch(/CREATE TABLE IF NOT EXISTS meeting_note_imports/);
    });
  });
});

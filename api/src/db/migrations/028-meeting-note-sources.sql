-- 028-meeting-note-sources.sql
-- v7.6 会议纪要采集渠道 - sources + import jobs
-- assets 表不动（asset_type='meeting_minutes' 已由 025 支持）

-- ---- Step 1: tables ----

CREATE TABLE IF NOT EXISTS meeting_note_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(32) NOT NULL
    CHECK (kind IN ('lark','zoom','teams','upload','folder','manual')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_cron VARCHAR(64),
  last_imported_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_note_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL
    REFERENCES meeting_note_sources(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL
    CHECK (status IN ('pending','running','succeeded','failed','partial')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_discovered INT NOT NULL DEFAULT 0,
  items_imported   INT NOT NULL DEFAULT 0,
  duplicates       INT NOT NULL DEFAULT 0,
  errors           INT NOT NULL DEFAULT 0,
  error_message    TEXT,
  asset_ids        UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  triggered_by     VARCHAR(32) NOT NULL DEFAULT 'manual'
);

-- ---- Step 2: indexes + trigger ----

CREATE INDEX IF NOT EXISTS idx_meeting_note_sources_active
  ON meeting_note_sources(is_active, kind);
CREATE INDEX IF NOT EXISTS idx_meeting_note_sources_kind
  ON meeting_note_sources(kind);

CREATE INDEX IF NOT EXISTS idx_meeting_note_imports_source
  ON meeting_note_imports(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_note_imports_active
  ON meeting_note_imports(status)
  WHERE status IN ('pending','running');

DROP TRIGGER IF EXISTS trg_meeting_note_sources_updated_at ON meeting_note_sources;
CREATE TRIGGER trg_meeting_note_sources_updated_at
  BEFORE UPDATE ON meeting_note_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---- Step 3: no data backfill ----

-- Rollback (manual):
-- DROP TRIGGER IF EXISTS trg_meeting_note_sources_updated_at ON meeting_note_sources;
-- DROP TABLE IF EXISTS meeting_note_imports;
-- DROP TABLE IF EXISTS meeting_note_sources;

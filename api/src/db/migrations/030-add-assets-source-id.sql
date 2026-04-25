-- v7.8: add assets.source_id for meeting-note ingest compatibility
-- Goal:
--   1) Add source_id column to assets if missing
--   2) Backfill source_id from metadata when possible
--   3) Add indexes for source lookup and dedup query

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);

-- Backfill from metadata.source_id (if present and source_id still null).
UPDATE assets
SET source_id = NULLIF(metadata->>'source_id', '')
WHERE source_id IS NULL
  AND metadata IS NOT NULL
  AND metadata ? 'source_id'
  AND NULLIF(metadata->>'source_id', '') IS NOT NULL;

-- Common lookup index used by asset/service filters.
CREATE INDEX IF NOT EXISTS idx_assets_source_id
  ON assets(source_id);

-- Dedup acceleration for meeting-note import:
-- SELECT ... WHERE source_id = $1 AND metadata->>'external_id' = $2
CREATE INDEX IF NOT EXISTS idx_assets_source_external_id
  ON assets(source_id, (metadata->>'external_id'));

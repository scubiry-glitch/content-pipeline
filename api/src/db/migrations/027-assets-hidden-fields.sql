-- v7.5 assets visibility fields for dedup + wiki protection
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_visibility
  ON assets(is_deleted, is_hidden, created_at DESC);

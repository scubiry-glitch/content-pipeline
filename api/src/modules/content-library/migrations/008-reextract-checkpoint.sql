-- Content Library v7.2 — G1: 断点续传
-- reextractBatch 可按 last_reextracted_at 跳过已处理的素材

ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_reextracted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_assets_reextract ON assets(last_reextracted_at);

COMMENT ON COLUMN assets.last_reextracted_at IS
  'Timestamp of last Content Library fact re-extraction. NULL = never re-extracted.';

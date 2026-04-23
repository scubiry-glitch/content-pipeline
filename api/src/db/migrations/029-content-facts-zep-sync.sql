-- Zep 知识回填：断点续传（按事实行标记已同步到指定 graph）
ALTER TABLE content_facts
  ADD COLUMN IF NOT EXISTS zep_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zep_graph_id TEXT,
  ADD COLUMN IF NOT EXISTS zep_sync_attempts SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN content_facts.zep_synced_at IS '最近一次成功写入 Zep/OpenZep 图的时间';
COMMENT ON COLUMN content_facts.zep_graph_id IS '成功写入时使用的 graph_id（与 ZEP_GRAPH_ID 对齐）';
COMMENT ON COLUMN content_facts.zep_sync_attempts IS '连续写入失败次数，达上限后不再自动重试该事实';

CREATE INDEX IF NOT EXISTS idx_content_facts_zep_resume
  ON content_facts (COALESCE(zep_sync_attempts, 0), confidence DESC, created_at DESC, id DESC)
  WHERE is_current = true;

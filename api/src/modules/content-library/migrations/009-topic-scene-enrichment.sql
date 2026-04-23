-- v7.5 议题场景化 + 争议三层召回
-- 1) content_topic_enrichments 扩列：scene / why 三问 / purpose / detected_tensions / angle_cards
-- 2) content_facts 可选 embedding 列（若 002-hybrid-search 已建则 IF NOT EXISTS 跳过）

ALTER TABLE content_topic_enrichments
  ADD COLUMN IF NOT EXISTS scene VARCHAR(40),
  ADD COLUMN IF NOT EXISTS scene_reason TEXT,
  ADD COLUMN IF NOT EXISTS why_now TEXT,
  ADD COLUMN IF NOT EXISTS why_you TEXT,
  ADD COLUMN IF NOT EXISTS why_it_works TEXT,
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(40),
  ADD COLUMN IF NOT EXISTS detected_tensions JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS angle_cards JSONB DEFAULT '[]';

-- L2 语义召回需要 embedding 列；pgvector 扩展若未启用则此 migration 忽略错误即可
-- (在启用了 pgvector 的环境中自动生效)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE content_facts ADD COLUMN IF NOT EXISTS content_embedding vector(1536);
    CREATE INDEX IF NOT EXISTS idx_facts_content_embedding
      ON content_facts USING ivfflat (content_embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- 静默失败：无 pgvector 时 L2 自动降级
  NULL;
END $$;

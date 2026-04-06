-- Content Library Module — 混合检索索引
-- Layer 3: PostgreSQL 全文检索 (BM25 等效)

-- ============================================================
-- tsvector 列 + GIN 索引 (用于关键词检索)
-- ============================================================

-- 为 assets 表添加全文检索向量列
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'assets') THEN
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS content_tsv tsvector;
  END IF;
END $$;

-- GIN 索引加速全文检索
CREATE INDEX IF NOT EXISTS idx_assets_content_tsv ON assets USING GIN(content_tsv);

-- 触发器: 自动维护 tsvector
CREATE OR REPLACE FUNCTION assets_tsv_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsv := to_tsvector('simple',
    COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assets_tsv_update ON assets;
CREATE TRIGGER trg_assets_tsv_update
  BEFORE INSERT OR UPDATE OF title, content ON assets
  FOR EACH ROW EXECUTE FUNCTION assets_tsv_trigger_fn();

-- ============================================================
-- 回填现有数据
-- ============================================================

-- 为所有已有 assets 行生成 tsvector (仅当 content_tsv 为空时)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'assets' AND column_name = 'content_tsv') THEN
    UPDATE assets
    SET content_tsv = to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, ''))
    WHERE content_tsv IS NULL;
  END IF;
END $$;

-- ============================================================
-- content_facts 的向量索引 (用于事实语义检索)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_content_facts_embedding ON content_facts
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- content_entities 的向量索引 (用于实体语义匹配)
CREATE INDEX IF NOT EXISTS idx_content_entities_embedding ON content_entities
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

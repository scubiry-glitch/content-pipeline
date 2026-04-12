-- Content Library v7.2 — T2.4: content_entity_relations 持久化边表
-- 物化 getEntityGraph 的 4 信号加权结果, 避免热门实体每次运行时重算

CREATE TABLE IF NOT EXISTS content_entity_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_a_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  entity_b_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  entity_a_name TEXT NOT NULL,
  entity_b_name TEXT NOT NULL,
  relation_type TEXT NOT NULL DEFAULT '',
  direct_score DECIMAL(6,3) DEFAULT 0,
  source_overlap_score DECIMAL(6,3) DEFAULT 0,
  type_affinity_score DECIMAL(3,2) DEFAULT 0,
  adamic_adar_score DECIMAL(6,3) DEFAULT 0,
  combined_score DECIMAL(6,3) DEFAULT 0,
  common_assets INTEGER DEFAULT 0,
  recomputed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_a_id, entity_b_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_relations_a
  ON content_entity_relations(entity_a_id, combined_score DESC);
CREATE INDEX IF NOT EXISTS idx_entity_relations_b
  ON content_entity_relations(entity_b_id, combined_score DESC);
CREATE INDEX IF NOT EXISTS idx_entity_relations_combined
  ON content_entity_relations(combined_score DESC);

COMMENT ON TABLE content_entity_relations IS
  'Materialized entity graph edges. Recomputed on demand via POST /relations/recompute.';

-- Content Library v7.2 — T2.1: Louvain 社区发现
-- 为 content_entities 添加 community_id 和 community_cohesion 列
-- Louvain 算法由后端 graphology 定期重算并写回

ALTER TABLE content_entities
  ADD COLUMN IF NOT EXISTS community_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS community_cohesion DECIMAL(4,3);

CREATE INDEX IF NOT EXISTS idx_content_entities_community
  ON content_entities(community_id) WHERE community_id IS NOT NULL;

COMMENT ON COLUMN content_entities.community_id IS
  'Louvain community cluster ID, recomputed on demand via POST /communities/recompute';
COMMENT ON COLUMN content_entities.community_cohesion IS
  'Intra-cluster edge density (0-1). Low (<0.15) indicates weak clustering.';

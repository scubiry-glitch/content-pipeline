-- Meeting Notes Module · 034 — content_entity_merge_candidates 实体合并候选队列
-- P4a 自动合并任务把「中档相似」及「所有 person 对」写入此表，交 P4b/人工复核。
CREATE TABLE IF NOT EXISTS content_entity_merge_candidates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_entity_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  source_entity_id UUID NOT NULL REFERENCES content_entities(id) ON DELETE CASCADE,
  entity_type      VARCHAR(50) NOT NULL,
  similarity       DOUBLE PRECISION NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_entity_id, source_entity_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_merge_candidates_status
  ON content_entity_merge_candidates(status);

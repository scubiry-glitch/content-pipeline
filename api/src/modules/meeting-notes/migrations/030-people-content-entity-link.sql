-- Meeting Notes Module · 030 — mn_people ↔ content_entities 桥接
-- 为每条 mn_people 关联全局规范实体（content-library 的 content_entities）。
-- 可空、可回滚；不改动既有 11 张 person 外键表。
ALTER TABLE mn_people
  ADD COLUMN IF NOT EXISTS content_entity_id UUID REFERENCES content_entities(id);

CREATE INDEX IF NOT EXISTS idx_mn_people_content_entity
  ON mn_people(content_entity_id);

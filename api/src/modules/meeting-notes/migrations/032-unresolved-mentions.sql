-- P2: 未解析人名停放队列（roster 命不中的名字入此，供 P4 复核 UI 消费）
CREATE TABLE IF NOT EXISTS mn_unresolved_mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id      UUID,
  raw_name        TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  occurrences     INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_mn_unresolved_status ON mn_unresolved_mentions(status);

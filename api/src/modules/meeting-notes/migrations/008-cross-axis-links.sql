-- Meeting Notes Module · 008 — 跨轴链接 Cross-axis links
--
-- 从一个 axis 的发现（源 item）指向另一个 axis 的相关项
-- 由 crosslinks/crossAxisLinkResolver 在 run 完成后写入
-- 索引支持：按源维度反查、按目标维度反查两个方向

CREATE TABLE IF NOT EXISTS mn_cross_axis_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  source_axis       VARCHAR(16) NOT NULL,
  source_item_type  VARCHAR(40) NOT NULL,   -- commitment/decision/judgment/...
  source_item_id    UUID NOT NULL,

  target_axis       VARCHAR(16) NOT NULL,
  target_item_type  VARCHAR(40) NOT NULL,
  target_item_id    UUID NOT NULL,

  relationship  TEXT NOT NULL,              -- 'commitment_at_risk_on_project' / 'anchoring_bias_in_speech' 等
  score         DECIMAL(5,2) NOT NULL DEFAULT 0,
  count         INT NOT NULL DEFAULT 1,
  scope_id      UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  last_computed_run_id UUID REFERENCES mn_runs(id) ON DELETE SET NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source_axis, source_item_id, target_axis, target_item_id, relationship)
);

CREATE INDEX IF NOT EXISTS idx_mn_crosslinks_source
  ON mn_cross_axis_links(source_axis, source_item_id);
CREATE INDEX IF NOT EXISTS idx_mn_crosslinks_target
  ON mn_cross_axis_links(target_axis, target_item_id);
CREATE INDEX IF NOT EXISTS idx_mn_crosslinks_scope_axis
  ON mn_cross_axis_links(scope_id, source_axis);

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_cross_axis_links;
-- ============================================================

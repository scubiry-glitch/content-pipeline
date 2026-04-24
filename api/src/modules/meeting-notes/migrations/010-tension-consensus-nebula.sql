-- Meeting Notes Module · 010 — 张力 / 共识叉 / 焦点星云 (Tier C LLM 输出)
--
-- 子维度：
--   mn_tensions + mn_tension_moments  → C.1 张力分类 (VariantEditorial § 02 / VariantWorkbench)
--   mn_consensus_items + mn_consensus_sides → C.2 共识叉 (VariantThreads · ConsensusGraph)
--   mn_focus_map                       → C.3 焦点星云 (VariantThreads · FocusNebula)

-- ============================================================
-- C.1 张力分类 — per-meeting, LLM 提取
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_tensions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID NOT NULL REFERENCES mn_meetings(id) ON DELETE CASCADE,
  tension_key  TEXT NOT NULL,                              -- 'T1', 'T2' …（LLM 生成的局部 ID）
  between_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],    -- 涉及的 person IDs
  topic        TEXT NOT NULL,
  intensity    NUMERIC(4,3) NOT NULL DEFAULT 0
               CHECK (intensity >= 0 AND intensity <= 1),
  summary      TEXT,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (meeting_id, tension_key)
);

CREATE INDEX IF NOT EXISTS idx_mn_tensions_meeting
  ON mn_tensions(meeting_id);

CREATE TABLE IF NOT EXISTS mn_tension_moments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tension_id  UUID NOT NULL REFERENCES mn_tensions(id) ON DELETE CASCADE,
  person_id   UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  quote       TEXT NOT NULL,
  seq         INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mn_tension_moments_tension
  ON mn_tension_moments(tension_id);

-- ============================================================
-- C.2 共识叉 — per-meeting, LLM 提取
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_consensus_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   UUID NOT NULL REFERENCES mn_meetings(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('consensus', 'divergence')),
  item_text    TEXT NOT NULL,
  supported_by UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],    -- 支持方 person IDs
  seq          INT NOT NULL DEFAULT 0,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_consensus_meeting
  ON mn_consensus_items(meeting_id);

CREATE TABLE IF NOT EXISTS mn_consensus_sides (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES mn_consensus_items(id) ON DELETE CASCADE,
  stance  TEXT NOT NULL,
  reason  TEXT,
  by_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  seq     INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mn_consensus_sides_item
  ON mn_consensus_sides(item_id);

-- ============================================================
-- C.3 焦点星云 — per-meeting, per-person
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_focus_map (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES mn_meetings(id) ON DELETE CASCADE,
  person_id   UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  themes      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  returns_to  INT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_focus_map_meeting
  ON mn_focus_map(meeting_id);

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_focus_map, mn_consensus_sides, mn_consensus_items,
--                         mn_tension_moments, mn_tensions CASCADE;
-- ============================================================

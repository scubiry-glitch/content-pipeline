-- CEO Module · 004 — Situation 房间 + War Room 阵型快照
--
-- ceo_stakeholders         外部利益相关方 (customer/regulator/investor/press/partner)
-- ceo_external_signals     外部信号墙 (引 content-library assets)
-- ceo_rubric_scores        Rubric 矩阵 (各方对各维度的评分)
-- ceo_formation_snapshots  War Room 阵型快照 (复用 mn_silence_signals + mn_judgments)

CREATE TABLE IF NOT EXISTS ceo_stakeholders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id          UUID NULL,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL
                    CHECK (kind IN ('customer','regulator','investor','press','partner','employee','other')),
  heat              NUMERIC(4,3) NOT NULL DEFAULT 0,  -- 0..1 关注热度
  last_signal_at    TIMESTAMPTZ NULL,
  description       TEXT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_stakeholders_scope_kind
  ON ceo_stakeholders (scope_id, kind);

CREATE INDEX IF NOT EXISTS idx_ceo_stakeholders_heat
  ON ceo_stakeholders (heat DESC, last_signal_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS ceo_external_signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stakeholder_id    UUID NOT NULL REFERENCES ceo_stakeholders(id) ON DELETE CASCADE,
  signal_text       TEXT NOT NULL,
  source_url        TEXT NULL,
  sentiment         NUMERIC(4,3) NULL,                -- -1..1
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ref_asset_id      TEXT NULL,                        -- 弱引 content-library assets.id
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ceo_external_signals_holder_time
  ON ceo_external_signals (stakeholder_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS ceo_rubric_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id          UUID NULL,
  stakeholder_id    UUID NULL REFERENCES ceo_stakeholders(id) ON DELETE SET NULL,
  dimension         TEXT NOT NULL,                    -- 'transparency'|'velocity'|'quality'|...
  score             NUMERIC(4,3) NOT NULL CHECK (score BETWEEN 0 AND 1),
  evidence_run_id   TEXT NULL,                        -- 弱引 mn_runs.id (LLM g2 任务)
  evidence_text     TEXT NULL,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_rubric_scores_scope_dim
  ON ceo_rubric_scores (scope_id, dimension, computed_at DESC);

CREATE TABLE IF NOT EXISTS ceo_formation_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id          UUID NULL,
  week_start        DATE NOT NULL,
  formation_data    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {nodes:[], links:[], conflict_kinds:{}}
  conflict_temp     NUMERIC(4,3) NULL,                   -- 0..1 冲突温度
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ceo_formation_snapshots_week
  ON ceo_formation_snapshots (week_start DESC);

-- ROLLBACK:
--   DROP TABLE IF EXISTS ceo_formation_snapshots;
--   DROP TABLE IF EXISTS ceo_rubric_scores;
--   DROP TABLE IF EXISTS ceo_external_signals;
--   DROP TABLE IF EXISTS ceo_stakeholders;

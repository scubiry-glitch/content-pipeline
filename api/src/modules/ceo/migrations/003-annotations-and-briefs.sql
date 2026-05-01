-- CEO Module · 003 — 简报 + 反方演练 + CEO 自有决策
--
-- ceo_briefs                  每次董事会的预读包快照
-- ceo_board_promises          预读包内的承诺追踪 (引 mn_decisions)
-- ceo_rebuttal_rehearsals     反方演练 (LLM 产物)
-- ceo_decisions               CEO 自有决策记录 (不是 mn_decisions 视图)

CREATE TABLE IF NOT EXISTS ceo_briefs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id            UUID NULL,
  board_session       TEXT NULL,                      -- 'Q2 2026' 等
  version             INT NOT NULL DEFAULT 1,
  toc                 JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{title, ord, future_tagged}, ...]
  body_md             TEXT NULL,
  page_count          INT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','superseded')),
  generated_run_id    TEXT NULL,                      -- 弱引 mn_runs.id (LLM 任务)
  generated_at        TIMESTAMPTZ NULL,
  read_at             TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_briefs_scope_session
  ON ceo_briefs (scope_id, board_session, version DESC);

CREATE TABLE IF NOT EXISTS ceo_board_promises (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id              UUID NOT NULL REFERENCES ceo_briefs(id) ON DELETE CASCADE,
  what                  TEXT NOT NULL,
  owner                 TEXT NULL,
  due_at                TIMESTAMPTZ NULL,
  status                TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('done','in_progress','late','dropped')),
  source_decision_id    TEXT NULL,                    -- 弱引 mn_decisions.id (text)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_board_promises_brief
  ON ceo_board_promises (brief_id, status);

CREATE TABLE IF NOT EXISTS ceo_rebuttal_rehearsals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id            UUID NULL REFERENCES ceo_briefs(id) ON DELETE SET NULL,
  scope_id            UUID NULL,
  attacker            TEXT NOT NULL,                  -- 'CFO'|'独立董事'|...
  attack_text         TEXT NOT NULL,
  defense_text        TEXT NULL,
  strength_score      NUMERIC(4,3) NULL,
  generated_run_id    TEXT NULL,                      -- 弱引 mn_runs.id (LLM g3 任务)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_rebuttal_rehearsals_brief
  ON ceo_rebuttal_rehearsals (brief_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ceo_decisions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id                UUID NULL,
  title                   TEXT NOT NULL,
  context                 TEXT NULL,
  options                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  chosen_option           TEXT NULL,
  rationale               TEXT NULL,
  linked_mn_decision_id   TEXT NULL,                  -- 弱引 mn_decisions.id
  linked_focus_item_id    UUID NULL,                  -- 弱引 ceo_focus_items.id (PR 后续)
  confidence              SMALLINT NULL CHECK (confidence BETWEEN 1 AND 5),
  reversibility           TEXT NULL CHECK (reversibility IN ('reversible','one_way')),
  decided_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  review_at               TIMESTAMPTZ NULL,
  outcome                 TEXT NULL,
  outcome_recorded_at     TIMESTAMPTZ NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_decisions_decided_at
  ON ceo_decisions (decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_ceo_decisions_linked_mn
  ON ceo_decisions (linked_mn_decision_id) WHERE linked_mn_decision_id IS NOT NULL;

-- ROLLBACK:
--   DROP TABLE IF EXISTS ceo_decisions;
--   DROP TABLE IF EXISTS ceo_rebuttal_rehearsals;
--   DROP TABLE IF EXISTS ceo_board_promises;
--   DROP TABLE IF EXISTS ceo_briefs;

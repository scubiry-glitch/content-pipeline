-- CEO Module · 002 — Compass + Boardroom 房间表
--
-- Compass (方向):
--   ceo_strategic_lines    战略主线/支线/漂移档案
--   ceo_strategic_echos    战略回响 (Sankey 数据源)
--   ceo_attention_alloc    注意力分配 (时间饼)
--
-- Boardroom (董事会):
--   ceo_directors             董事画像
--   ceo_director_concerns     董事关切雷达

-- ─────────────────────────────────────────
-- Compass · 方向房间
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ceo_strategic_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id          UUID NULL,
  name              TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('main','branch','drift')),
  established_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  alignment_score   NUMERIC(4,3) NULL,                -- 0..1
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','paused','retired')),
  description       TEXT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_strategic_lines_scope
  ON ceo_strategic_lines (scope_id) WHERE scope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ceo_strategic_lines_kind
  ON ceo_strategic_lines (kind, status);

CREATE TABLE IF NOT EXISTS ceo_strategic_echos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id           UUID NOT NULL REFERENCES ceo_strategic_lines(id) ON DELETE CASCADE,
  hypothesis_text   TEXT NOT NULL,                    -- 假设
  fact_text         TEXT NULL,                        -- 现实回响
  fate              TEXT NOT NULL DEFAULT 'pending'
                    CHECK (fate IN ('confirm','refute','pending')),
  evidence_run_ids  TEXT[] NOT NULL DEFAULT '{}',     -- 弱引 mn_runs.id (text)
  source_meeting_id UUID NULL,                        -- 弱引 assets/mn_meetings
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_strategic_echos_line
  ON ceo_strategic_echos (line_id, fate, updated_at DESC);

CREATE TABLE IF NOT EXISTS ceo_attention_alloc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id          UUID NULL,
  user_id           TEXT NULL,
  week_start        DATE NOT NULL,
  project_id        UUID NULL,                        -- 弱引 mn_scopes (kind=project)
  hours             NUMERIC(5,2) NOT NULL DEFAULT 0,
  kind              TEXT NOT NULL CHECK (kind IN ('main','branch','firefighting')),
  source            TEXT NULL,                        -- 'manual'|'aggregated'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_attention_alloc_week
  ON ceo_attention_alloc (week_start DESC, kind);

-- ─────────────────────────────────────────
-- Boardroom · 董事会房间
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ceo_directors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id          UUID NULL,
  name              TEXT NOT NULL,
  role              TEXT NULL,                        -- chairman|board|investor|advisor
  weight            NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_directors_scope
  ON ceo_directors (scope_id) WHERE scope_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ceo_director_concerns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  director_id       UUID NOT NULL REFERENCES ceo_directors(id) ON DELETE CASCADE,
  topic             TEXT NOT NULL,
  raised_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','answered','superseded')),
  raised_count      INT NOT NULL DEFAULT 1,
  source_meeting_id UUID NULL,
  resolution        TEXT NULL,
  resolved_at       TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_ceo_director_concerns_director_status
  ON ceo_director_concerns (director_id, status, raised_at DESC);

-- ROLLBACK:
--   DROP TABLE IF EXISTS ceo_director_concerns;
--   DROP TABLE IF EXISTS ceo_directors;
--   DROP TABLE IF EXISTS ceo_attention_alloc;
--   DROP TABLE IF EXISTS ceo_strategic_echos;
--   DROP TABLE IF EXISTS ceo_strategic_lines;

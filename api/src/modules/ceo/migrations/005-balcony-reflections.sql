-- CEO Module · 005 — Balcony 个人房间反思 + 时间 ROI
--
-- ceo_balcony_reflections    周日 21:00 反思快照（云月远山）
-- ceo_time_roi               每周时间 ROI（深度专注/会议/外耗）

CREATE TABLE IF NOT EXISTS ceo_balcony_reflections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,
  week_start        DATE NOT NULL,
  prism_id          TEXT NULL CHECK (prism_id IS NULL OR prism_id IN ('direction','board','coord','team','ext','self')),
  question          TEXT NOT NULL,
  prompt            TEXT NULL,
  user_answer       TEXT NULL,
  mood              TEXT NULL CHECK (mood IS NULL OR mood IN ('clear','tense','tired','grateful','restless','focused')),
  generated_run_id  TEXT NULL,                          -- 弱引 mn_runs.id (LLM 出题)
  answered_at       TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start, prism_id)
);

CREATE INDEX IF NOT EXISTS idx_ceo_balcony_reflections_user_week
  ON ceo_balcony_reflections (user_id, week_start DESC);

CREATE TABLE IF NOT EXISTS ceo_time_roi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,
  week_start          DATE NOT NULL,
  total_hours         NUMERIC(5,2) NOT NULL DEFAULT 0,
  deep_focus_hours    NUMERIC(5,2) NOT NULL DEFAULT 0,
  meeting_hours       NUMERIC(5,2) NOT NULL DEFAULT 0,
  target_focus_hours  NUMERIC(5,2) NOT NULL DEFAULT 0,
  weekly_roi          NUMERIC(4,3) NULL,                -- deep_focus / target_focus
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ceo_time_roi_user_week
  ON ceo_time_roi (user_id, week_start DESC);

-- ROLLBACK:
--   DROP TABLE IF EXISTS ceo_time_roi;
--   DROP TABLE IF EXISTS ceo_balcony_reflections;

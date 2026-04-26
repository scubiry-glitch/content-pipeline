-- Meeting Notes Module · 012 — 张力 axis (tension)
--
-- 历史背景：migration 010 已创建 mn_tensions（C.1 视图用），schema 是：
--   id, meeting_id VARCHAR(50), tension_key TEXT NOT NULL, between_ids[],
--   topic, intensity NUMERIC(4,3), summary, computed_at, meta JSONB
-- P1-5 复用同一张表但要新增 moments / scope_id 列，并放宽 tension_key NOT NULL
-- 限制（LLM 不一定每条都给出 T1/T2 标签）。
--
-- 本 migration 用 ALTER 而非 CREATE，对 010 已存在的表做幂等扩展。
-- 若 010 还没跑过（mn_tensions 不存在），先 CREATE 一个最小骨架。

-- 1) 兜底：表不存在则创建（与 010 兼容的最小 schema + 新列）
CREATE TABLE IF NOT EXISTS mn_tensions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id   VARCHAR(50) NOT NULL,
  tension_key  TEXT,
  between_ids  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  topic        TEXT NOT NULL,
  intensity    NUMERIC(4,3) NOT NULL DEFAULT 0
               CHECK (intensity >= 0 AND intensity <= 1),
  summary      TEXT,
  moments      JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) 已存在 010 schema：加新列、放宽约束
ALTER TABLE mn_tensions
  ADD COLUMN IF NOT EXISTS moments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mn_tensions
  ADD COLUMN IF NOT EXISTS scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL;

-- 010 的 tension_key TEXT NOT NULL → 放宽（P1-5 的 LLM 不强制要求）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'mn_tensions' AND column_name = 'tension_key'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE mn_tensions ALTER COLUMN tension_key DROP NOT NULL;
  END IF;
END $$;

-- 3) 索引：按 meeting_id + intensity 主查
CREATE INDEX IF NOT EXISTS idx_mn_tensions_meeting
  ON mn_tensions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_tensions_intensity
  ON mn_tensions(meeting_id, intensity DESC);
CREATE INDEX IF NOT EXISTS idx_mn_tensions_scope
  ON mn_tensions(scope_id) WHERE scope_id IS NOT NULL;

-- 4) 扩展 mn_runs.axis CHECK 约束以接受 'tension'
ALTER TABLE mn_runs
  DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
ALTER TABLE mn_runs
  ADD CONSTRAINT mn_runs_axis_check
  CHECK (axis IN ('people', 'projects', 'knowledge', 'meta', 'tension', 'longitudinal', 'all'));

-- ============================================================
-- Rollback (manual):
--   ALTER TABLE mn_tensions DROP COLUMN IF EXISTS moments;
--   ALTER TABLE mn_tensions DROP COLUMN IF EXISTS scope_id;
--   ALTER TABLE mn_runs DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
--   ALTER TABLE mn_runs ADD CONSTRAINT mn_runs_axis_check
--     CHECK (axis IN ('people','projects','knowledge','meta','longitudinal','all'));
-- ============================================================

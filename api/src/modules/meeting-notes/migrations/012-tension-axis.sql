-- Meeting Notes Module · 012 — 张力 axis (tension)
--
-- demo 的"张力"维度需要：人物对（between_ids）+ 量化强度（intensity 0-1）
-- + 原文片段（moments JSONB）+ 因果摘要（summary）。这些字段在原 16 个
-- axes 表里没有合适落点（mn_cognitive_biases 是单人偏误、010 的
-- mn_tension_moments 是 C.1 单视图临时表），因此新建 mn_tensions。

CREATE TABLE IF NOT EXISTS mn_tensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,

  -- 显式标签（如 T1/T2，对应 demo 的 ANALYSIS.tension[].id）
  tension_key VARCHAR(80),

  -- 对立方人物 IDs（2-N 个 person_id；多于 2 个表示派系）
  between_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],

  -- 对立焦点（"中游 vs 训练层" / "集中度 vs LP 偏好"）
  topic TEXT NOT NULL,

  -- 强度 0-1：0.3=温和分歧 0.6=明显对立 0.85+=激烈交锋
  intensity DECIMAL(3,2) NOT NULL DEFAULT 0.5,

  -- 2-3 句因果摘要：谁主张什么、对方反驳什么、为什么
  summary TEXT,

  -- 原文片段数组：[{who:"人名", text:"≤60 字原文"}]
  moments JSONB NOT NULL DEFAULT '[]'::jsonb,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_tensions_meeting
  ON mn_tensions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_tensions_intensity
  ON mn_tensions(meeting_id, intensity DESC);
CREATE INDEX IF NOT EXISTS idx_mn_tensions_scope
  ON mn_tensions(scope_id) WHERE scope_id IS NOT NULL;

-- ============================================================
-- 扩展 mn_runs.axis CHECK 约束以接受 'tension'
-- mn_runs CHECK 在 006 迁移里硬编码，新加 axis 必须 drop + recreate
-- ============================================================
ALTER TABLE mn_runs
  DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
ALTER TABLE mn_runs
  ADD CONSTRAINT mn_runs_axis_check
  CHECK (axis IN ('people', 'projects', 'knowledge', 'meta', 'tension', 'longitudinal', 'all'));

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_tensions CASCADE;
--   ALTER TABLE mn_runs DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
--   ALTER TABLE mn_runs ADD CONSTRAINT mn_runs_axis_check
--     CHECK (axis IN ('people','projects','knowledge','meta','longitudinal','all'));
-- ============================================================

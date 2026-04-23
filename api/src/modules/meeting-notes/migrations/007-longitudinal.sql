-- Meeting Notes Module · 007 — 纵向视图 Longitudinal
--
-- 三类跨会议分析：
--   · mn_belief_drift_series        一个人对一个 topic 的信念漂移曲线
--   · mn_decision_tree_snapshots    项目级决策树 snapshot（跨会议 DAG 扁平化）
--   · mn_mental_model_hit_stats     模型命中率（跨 scope 汇总）

-- ============================================================
-- 信念漂移时间序列
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_belief_drift_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES mn_people(id) ON DELETE CASCADE,
  topic_id VARCHAR(120) NOT NULL,              -- 'reasoning_layer' / 'lp_comms_cadence' 等
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,

  -- 时间序列数组
  -- [{ meeting_id, date: ISO8601, value: -1..1, confidence: 0..1, note?: string }]
  points JSONB NOT NULL DEFAULT '[]'::jsonb,

  last_updated_run_id UUID REFERENCES mn_runs(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (person_id, topic_id, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_belief_drift_topic
  ON mn_belief_drift_series(topic_id);
CREATE INDEX IF NOT EXISTS idx_mn_belief_drift_scope
  ON mn_belief_drift_series(scope_id);

-- ============================================================
-- 决策树 snapshot —— 某 scope 的决策 DAG 扁平化
-- nodes: [{ id, parent, branch, decided, meeting_id, date, current, pending }]
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_decision_tree_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NOT NULL REFERENCES mn_scopes(id) ON DELETE CASCADE,
  root_decision_id UUID REFERENCES mn_decisions(id) ON DELETE SET NULL,
  nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_run_id UUID REFERENCES mn_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mn_decision_tree_scope
  ON mn_decision_tree_snapshots(scope_id, computed_at DESC);

-- ============================================================
-- 心智模型命中率 —— scope × model_name
-- flag: priority (>=80% 命中)  / downweight (<65% 且 3 个月下行) / unused
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_mental_model_hit_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name VARCHAR(120) NOT NULL,
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  invocations INT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  hit_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  trend_30d DECIMAL(5,4),
  flag VARCHAR(16) NOT NULL DEFAULT 'unused'
    CHECK (flag IN ('priority','downweight','unused','neutral')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_run_id UUID REFERENCES mn_runs(id) ON DELETE SET NULL,

  UNIQUE (model_name, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_model_hit_stats_scope_rate
  ON mn_mental_model_hit_stats(scope_id, hit_rate DESC);

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_mental_model_hit_stats,
--                         mn_decision_tree_snapshots,
--                         mn_belief_drift_series CASCADE;
-- ============================================================

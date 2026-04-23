-- Meeting Notes Module · 006 — 运行 / 版本
-- 生成中心核心表：mn_runs (队列 + 审计) + mn_axis_versions (轴级 snapshot)
-- 注：本迁移文件编号沿用 §3 规划中的 006 序号；
-- 001=scope, 002-005=axes, 006=runs, 007=longitudinal, 008=crosslinks, 009=migrate

-- ============================================================
-- mn_runs: 单次重算作业
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 作用域
  scope_kind VARCHAR(16) NOT NULL
    CHECK (scope_kind IN ('library', 'project', 'client', 'topic', 'meeting')),
  scope_id UUID,  -- library 时为空

  -- 计算目标
  axis VARCHAR(16) NOT NULL
    CHECK (axis IN ('people', 'projects', 'knowledge', 'meta', 'longitudinal', 'all')),
  sub_dims TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- 专家调用配置
  preset VARCHAR(16) NOT NULL DEFAULT 'standard'
    CHECK (preset IN ('lite', 'standard', 'max')),
  strategy_spec TEXT,  -- 如 "failure_check|emm_iterative|debate"

  -- 状态机
  state VARCHAR(16) NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  triggered_by VARCHAR(16) NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('auto', 'manual', 'schedule', 'cascade')),
  parent_run_id UUID REFERENCES mn_runs(id) ON DELETE SET NULL,

  -- 计时 / 成本
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  cost_tokens INT NOT NULL DEFAULT 0,
  cost_ms INT NOT NULL DEFAULT 0,
  progress_pct DECIMAL(5,2) NOT NULL DEFAULT 0,

  -- 审计
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 查询模式:
-- 1) 某 scope × axis 的历史：按 (scope_kind, scope_id, axis, started_at DESC)
CREATE INDEX IF NOT EXISTS idx_mn_runs_scope_axis_started
  ON mn_runs(scope_kind, scope_id, axis, started_at DESC NULLS LAST);

-- 2) 活跃作业（running/queued）只占少数，partial index
CREATE INDEX IF NOT EXISTS idx_mn_runs_active
  ON mn_runs(state, created_at)
  WHERE state IN ('running', 'queued');

-- 3) 级联：按 parent_run_id 找子任务
CREATE INDEX IF NOT EXISTS idx_mn_runs_parent
  ON mn_runs(parent_run_id)
  WHERE parent_run_id IS NOT NULL;

-- ============================================================
-- mn_axis_versions: 每次 run 成功 → 给 (scope, axis) 打 snapshot
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_axis_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES mn_runs(id) ON DELETE CASCADE,

  scope_kind VARCHAR(16) NOT NULL,
  scope_id UUID,
  axis VARCHAR(16) NOT NULL,

  version_label VARCHAR(32) NOT NULL,  -- 'v14' / '2026-04-23-1' 等
  snapshot JSONB NOT NULL,              -- 该 axis 在此 scope 下的整合视图
  diff_vs_prev JSONB,                   -- { added:[], changed:[], removed:[] }
  prev_version_id UUID REFERENCES mn_axis_versions(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (scope_kind, scope_id, axis, version_label)
);

CREATE INDEX IF NOT EXISTS idx_mn_axis_versions_scope_axis_created
  ON mn_axis_versions(scope_kind, scope_id, axis, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mn_axis_versions_run ON mn_axis_versions(run_id);

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_axis_versions;
--   DROP TABLE IF EXISTS mn_runs;
-- ============================================================

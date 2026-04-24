-- Meeting Notes Module · 011 — 定时计划 (Phase 15.7)
--
-- 给 GenerationCenter · ScheduleView 用的 cron 配置表
-- 一条 schedule = "在 cron 时间点对某 scope × axis 触发 enqueueRun"
-- 不直接执行 cron · 仅存配置 · 由外部 worker / cron 守护读取

CREATE TABLE IF NOT EXISTS mn_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(64) NOT NULL,
  cron VARCHAR(64),                   -- 标准 5-field cron 表达式 · NULL 表示禁用
  on_state BOOLEAN NOT NULL DEFAULT TRUE,

  -- 触发目标（与 mn_runs 同构）
  scope_kind VARCHAR(16)
    CHECK (scope_kind IS NULL OR scope_kind IN ('library', 'project', 'client', 'topic', 'meeting')),
  scope_id UUID,
  axis VARCHAR(16)
    CHECK (axis IS NULL OR axis IN ('people', 'projects', 'knowledge', 'meta', 'longitudinal', 'all')),
  preset VARCHAR(16) DEFAULT 'standard'
    CHECK (preset IN ('lite', 'standard', 'max')),

  -- 运行时维护字段（worker 写入）· 便于 list 时直接展示
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_run_id UUID,                   -- 关联到 mn_runs.id

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_schedules_scope
  ON mn_schedules(scope_kind, scope_id);
CREATE INDEX IF NOT EXISTS idx_mn_schedules_on
  ON mn_schedules(on_state) WHERE on_state = TRUE;

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_schedules CASCADE;
-- ============================================================

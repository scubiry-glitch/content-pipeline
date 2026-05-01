-- Meeting Notes Module · 020 — mn_runs 加 module 字段
--
-- 背景：CEO 应用 (api/src/modules/ceo/) 需要复用 meeting-notes 的 LLM 任务调度
-- 基础设施 (mn_runs + runQueue + runEngine + claudeCliRunner)，避免重复建设
-- ~600 行调度代码。
--
-- 设计：mn_runs 加 module text 字段，默认 'mn' (兼容现有所有行)；CEO 模块的
-- LLM 任务（briefing/trend/g3-expert/g4-rehash）入队时传 module='ceo'，由 CEO
-- 自己的 handler 接管 (PR12)。
--
-- 配套改动：
--   1. runEngine.recoverQueuedRuns 过滤 WHERE module='mn' (避免误捡 ceo 任务)
--   2. CEO 模块拥有自己的 ceoEngine.handleRun 接管 module='ceo' 的 run
--   3. 前端 GenerationCenter 不改 (查 mn_runs 自动透明显示两类)
--
-- 注意：现有 enqueueRun 不传 module，由列默认值兜底；CEO PR12 显式传 'ceo'。

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'mn';

CREATE INDEX IF NOT EXISTS idx_mn_runs_module
  ON mn_runs(module, created_at DESC);

-- 复合索引：runEngine.recoverQueuedRuns 用 (module, state) 过滤
CREATE INDEX IF NOT EXISTS idx_mn_runs_module_state
  ON mn_runs(module, state) WHERE state IN ('queued', 'running');

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_mn_runs_module_state;
--   DROP INDEX IF EXISTS idx_mn_runs_module;
--   ALTER TABLE mn_runs DROP COLUMN IF EXISTS module;

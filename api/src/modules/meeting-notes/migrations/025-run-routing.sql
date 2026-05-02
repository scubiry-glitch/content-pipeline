-- Meeting Notes · 025 — mn_runs.target_worker
--
-- 配合 api/config/run-routing.json + api/src/modules/run-routing/service.ts 使用。
-- 路由规则不入库 (改用 JSON 配置文件)，但 mn_runs 仍要存解析结果，让 worker
-- 端 SQL 能 `WHERE target_worker IS NULL OR target_worker = $WORKER_ID` 过滤。
--
-- 兼容：老 mn_runs 行 target_worker = NULL → 任意 worker 都能消费（不破坏现有行为）

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS target_worker TEXT NULL;

-- 轮询过滤的复合索引：(module, state, target_worker, created_at)
CREATE INDEX IF NOT EXISTS idx_mn_runs_target_worker_queue
  ON mn_runs (module, state, target_worker, created_at ASC)
  WHERE state IN ('queued', 'running');

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_mn_runs_target_worker_queue;
--   ALTER TABLE mn_runs DROP COLUMN IF EXISTS target_worker;

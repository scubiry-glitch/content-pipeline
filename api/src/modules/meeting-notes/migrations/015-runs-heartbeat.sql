-- Meeting Notes Module · 014 — mn_runs worker_id + heartbeat
--
-- 给 mn_runs 加 worker_id（进程标识）+ last_heartbeat_at（每 30 秒由 RunEngine 更新），
-- 让运维能区分 stuck-running vs still-active：
--   - 旧 cleanupZombieRuns 等 started_at < NOW() - 30min 才 mark failed → 慢
--   - 新 cleanup：last_heartbeat_at < NOW() - 5min 即 mark failed → 5 倍快
--
-- worker_id 形如 'hostname:pid:start_ts'，便于多进程时定位 owner（P2-B pg-boss 路径上有用）
-- 字段都允许 NULL，向后兼容旧 run 行（旧行 cleanup 仍走 started_at 旧逻辑）

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS worker_id VARCHAR(64);

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- 索引：清扫僵尸 run 的查询走 (state, last_heartbeat_at)
CREATE INDEX IF NOT EXISTS idx_mn_runs_active_heartbeat
  ON mn_runs(state, last_heartbeat_at NULLS FIRST)
  WHERE state = 'running';

-- 旧 running 行没有 heartbeat → backfill 为 started_at（让旧 zombie 仍能被 cleanup 检出来）
UPDATE mn_runs
   SET last_heartbeat_at = started_at
 WHERE state = 'running'
   AND last_heartbeat_at IS NULL
   AND started_at IS NOT NULL;

-- ============================================================
-- Rollback (manual):
--   ALTER TABLE mn_runs DROP COLUMN worker_id;
--   ALTER TABLE mn_runs DROP COLUMN last_heartbeat_at;
--   DROP INDEX IF EXISTS idx_mn_runs_active_heartbeat;
-- ============================================================

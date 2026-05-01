-- mn_runs.axis CHECK 扩展: 接纳 CEO 模块的加工步骤 g1..g5
--
-- 背景: PR12 后 mn_runs 加了 module 字段 (migration 020) 让 CEO 任务和 mn 任务共用队列。
-- 但 axis 的 CHECK 约束还停留在 mn 时代 (012 加了 tension), 不包含 'g1'..'g5'。
-- 后果: enqueueCeoRun 插入 axis='g3' 等记录违反约束 → 静默 ok:false → 任务永不入队。
--
-- 修复策略:
--   - 扩展 CHECK 接受 'g1','g2','g3','g4','g5' (CEO 5 步加工)
--   - 同时保留 011-schedules.sql 中 mn_run_schedules 的 CHECK 一致性
--
-- 幂等: DROP CONSTRAINT IF EXISTS + 重建

ALTER TABLE mn_runs
  DROP CONSTRAINT IF EXISTS mn_runs_axis_check;

ALTER TABLE mn_runs
  ADD CONSTRAINT mn_runs_axis_check
  CHECK (axis IN (
    -- mn axes
    'people', 'projects', 'knowledge', 'meta', 'tension', 'longitudinal', 'all',
    -- CEO 加工步骤 (PR12+)
    'g1', 'g2', 'g3', 'g4', 'g5'
  ));

-- mn_run_schedules 同步扩展 (axis 字段也用同样取值)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mn_run_schedules') THEN
    EXECUTE 'ALTER TABLE mn_run_schedules DROP CONSTRAINT IF EXISTS mn_run_schedules_axis_check';
    EXECUTE 'ALTER TABLE mn_run_schedules
             ADD CONSTRAINT mn_run_schedules_axis_check
             CHECK (axis IS NULL OR axis IN (
               ''people'', ''projects'', ''knowledge'', ''meta'', ''tension'', ''longitudinal'', ''all'',
               ''g1'', ''g2'', ''g3'', ''g4'', ''g5''
             ))';
  END IF;
END $$;

-- ROLLBACK:
--   ALTER TABLE mn_runs DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
--   ALTER TABLE mn_runs ADD CONSTRAINT mn_runs_axis_check
--     CHECK (axis IN ('people','projects','knowledge','meta','tension','longitudinal','all'));

-- mn_runs.axis CHECK 放宽为 regex pattern, 取代 021 的枚举扩展
--
-- 设计 (用户反馈 2026-05-01):
--   原 enum CHECK 每加一种 axis 就要新 migration, 维护成本高。
--   改为 regex 兼容 mn 既有 axis (people/projects/...) 和 CEO 新增的语义化命名:
--     mn  : people / projects / knowledge / meta / tension / longitudinal / all
--     ceo : <room>-<action> 形式 (如 warroom-sandbox / boardroom-annotations / compass-echo)
--     legacy: g1..g5 (向后兼容, 短期内保留, 后续逐步迁移到语义化命名)
--
-- pattern: ^[a-z][a-z0-9_-]{0,63}$  (小写字母开头, 总长 ≤ 64)

ALTER TABLE mn_runs
  DROP CONSTRAINT IF EXISTS mn_runs_axis_check;

ALTER TABLE mn_runs
  ADD CONSTRAINT mn_runs_axis_check
  CHECK (axis ~ '^[a-z][a-z0-9_-]{0,63}$');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mn_run_schedules') THEN
    EXECUTE 'ALTER TABLE mn_run_schedules DROP CONSTRAINT IF EXISTS mn_run_schedules_axis_check';
    EXECUTE 'ALTER TABLE mn_run_schedules
             ADD CONSTRAINT mn_run_schedules_axis_check
             CHECK (axis IS NULL OR axis ~ ''^[a-z][a-z0-9_-]{0,63}$'')';
  END IF;
END $$;

-- ROLLBACK:
--   ALTER TABLE mn_runs DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
--   ALTER TABLE mn_runs ADD CONSTRAINT mn_runs_axis_check
--     CHECK (axis IN ('people','projects','knowledge','meta','tension','longitudinal','all',
--                     'g1','g2','g3','g4','g5'));

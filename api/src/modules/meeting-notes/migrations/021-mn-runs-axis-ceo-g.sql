-- Meeting Notes Module · 021 — mn_runs.axis 允许 CEO 五加工轴 g1..g5
--
-- 背景：War Room sandbox 等入队 `axis='g3'` + module='ceo'，006/012 的 CHECK
-- 仅含 people/projects/.../tension，导致 INSERT 失败 → enqueueCeoRun 静默失败。
--
-- ROLLBACK:
--   ALTER TABLE mn_runs DROP CONSTRAINT IF EXISTS mn_runs_axis_check;
--   ALTER TABLE mn_runs ADD CONSTRAINT mn_runs_axis_check
--     CHECK (axis IN ('people','projects','knowledge','meta','tension','longitudinal','all'));

ALTER TABLE mn_runs
  DROP CONSTRAINT IF EXISTS mn_runs_axis_check;

ALTER TABLE mn_runs
  ADD CONSTRAINT mn_runs_axis_check
  CHECK (axis IN (
    'people', 'projects', 'knowledge', 'meta', 'tension', 'longitudinal', 'all',
    'g1', 'g2', 'g3', 'g4', 'g5'
  ));

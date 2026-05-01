-- Meeting Notes Module · 017 — meeting detail 页面查询性能索引
--
-- 背景：getMeetingAxes() 17 条 SQL 串行查 mn_* 表，再加 router 端 3-4 条额外查询。
-- 受影响最严重的几处：
--   1. mn_assumptions 用 WHERE meeting_id = $1 但只有 (scope_id, verification_state) 索引 → 全表扫
--   2. mn_open_questions 用 WHERE first_raised_meeting_id = $1 OR last_raised_meeting_id = $1
--      但只有 (scope_id, status) 索引 → 全表扫
--
-- 本 migration：补 meeting_id / first_last_raised 维度的索引。
-- mn_risks 当前 schema（003）无 meeting_id 列，勿在此建 idx_mn_risks_meeting（会 init 失败）。

CREATE INDEX IF NOT EXISTS idx_mn_assumptions_meeting
  ON mn_assumptions(meeting_id);

CREATE INDEX IF NOT EXISTS idx_mn_open_questions_first_raised
  ON mn_open_questions(first_raised_meeting_id);

CREATE INDEX IF NOT EXISTS idx_mn_open_questions_last_raised
  ON mn_open_questions(last_raised_meeting_id);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_mn_assumptions_meeting;
--   DROP INDEX IF EXISTS idx_mn_open_questions_first_raised;
--   DROP INDEX IF EXISTS idx_mn_open_questions_last_raised;

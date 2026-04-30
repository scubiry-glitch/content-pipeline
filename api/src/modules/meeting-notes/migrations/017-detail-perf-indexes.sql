-- Meeting Notes Module · 017 — meeting detail 页面查询性能索引
--
-- 背景：getMeetingAxes() 17 条 SQL 串行查 mn_* 表，再加 router 端 3-4 条额外查询。
-- 受影响最严重的三处：
--   1. mn_risks 走 scope_id IN (subquery) 拉，外层无 meeting_id 索引 → 全表扫
--   2. mn_assumptions 用 WHERE meeting_id = $1 但只有 (scope_id, verification_state) 索引 → 全表扫
--   3. mn_open_questions 用 WHERE first_raised_meeting_id = $1 OR last_raised_meeting_id = $1
--      但只有 (scope_id, status) 索引 → 全表扫
--
-- 本 migration：补 4 个 meeting_id 维度的索引。
-- 真实数据（万级会议 / 十万级 axis 行）下，预期单表查询从 500ms-2s 降到 5-10ms。
--
-- 注：mn_risks 查询路径仍然要先解 scope_id（必经），但补 meeting_id 索引后，外层
-- 选择器若改用 meeting_id 直查（未来优化）可立即受益；当前路径可借助索引快速 EXIST
-- 校验，仍有提升。

CREATE INDEX IF NOT EXISTS idx_mn_risks_meeting
  ON mn_risks(meeting_id);

CREATE INDEX IF NOT EXISTS idx_mn_assumptions_meeting
  ON mn_assumptions(meeting_id);

CREATE INDEX IF NOT EXISTS idx_mn_open_questions_first_raised
  ON mn_open_questions(first_raised_meeting_id);

CREATE INDEX IF NOT EXISTS idx_mn_open_questions_last_raised
  ON mn_open_questions(last_raised_meeting_id);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_mn_risks_meeting;
--   DROP INDEX IF EXISTS idx_mn_assumptions_meeting;
--   DROP INDEX IF EXISTS idx_mn_open_questions_first_raised;
--   DROP INDEX IF EXISTS idx_mn_open_questions_last_raised;

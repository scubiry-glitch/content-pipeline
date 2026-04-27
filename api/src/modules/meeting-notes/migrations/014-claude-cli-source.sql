-- Meeting Notes Module · 014 — Claude CLI 模式 source 标记
--
-- 1. 给 010 创建的 5 张表（mn_tensions / mn_tension_moments / mn_consensus_items /
--    mn_consensus_sides / mn_focus_map）补上 source 列；013 漏了它们。
-- 2. 把 013 加的 source CHECK 约束扩展为接受 'claude_cli'。
--    新值含义：'claude_cli' = runs/claudeCliRunner.ts 通过 child_process.spawn 调用
--    Claude Code CLI 一次性生成的产出（与 'llm_extracted' 平行；轴重跑按 source
--    分别 DELETE-replace，互不覆盖）。

-- ============================================================
-- 1. 为缺失的 5 张表加 source 列
-- ============================================================
ALTER TABLE mn_tensions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored','claude_cli'));

ALTER TABLE mn_tension_moments
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored','claude_cli'));

ALTER TABLE mn_consensus_items
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored','claude_cli'));

ALTER TABLE mn_consensus_sides
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored','claude_cli'));

ALTER TABLE mn_focus_map
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored','claude_cli'));

-- ============================================================
-- 2. 扩展 013 已加表的 CHECK 约束，接受 'claude_cli'
--    PG 没有 ALTER CONSTRAINT 改 CHECK，必须先 DROP CONSTRAINT 再 ADD。
--    PG 自动给 ADD COLUMN 时的内联 CHECK 命名为 <table>_<col>_check。
-- ============================================================
DO $$
DECLARE
  tbl text;
  con_name text;
  tables text[] := ARRAY[
    'mn_commitments', 'mn_role_trajectory_points', 'mn_speech_quality', 'mn_silence_signals',
    'mn_decisions', 'mn_assumptions', 'mn_open_questions', 'mn_risks',
    'mn_judgments', 'mn_mental_model_invocations', 'mn_cognitive_biases',
    'mn_counterfactuals', 'mn_evidence_grades',
    'mn_decision_quality', 'mn_meeting_necessity', 'mn_affect_curve'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- 找到该表 source 列的 CHECK 约束（约束名通常 <table>_source_check）
    SELECT conname INTO con_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = tbl
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%source%';
    IF con_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', tbl, con_name);
    END IF;
    -- 重新加上扩展后的 CHECK
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (source IN (''llm_extracted'',''manual_import'',''human_edit'',''restored'',''claude_cli''))',
      tbl, tbl || '_source_check'
    );
  END LOOP;
END $$;

-- ============================================================
-- 3. 索引：(source, meeting_id) 复合索引便于 claude-cli 重跑时的 DELETE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mn_tensions_source_meeting
  ON mn_tensions(source, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_consensus_items_source_meeting
  ON mn_consensus_items(source, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_focus_map_source_meeting
  ON mn_focus_map(source, meeting_id);

-- ============================================================
-- Rollback (manual)
-- ============================================================
-- ALTER TABLE mn_tensions DROP COLUMN source;
-- ALTER TABLE mn_tension_moments DROP COLUMN source;
-- ALTER TABLE mn_consensus_items DROP COLUMN source;
-- ALTER TABLE mn_consensus_sides DROP COLUMN source;
-- ALTER TABLE mn_focus_map DROP COLUMN source;
-- 13 张表的 CHECK 约束回滚到 013 版（去掉 'claude_cli'）— 同样需 DROP/ADD 一遍

-- Meeting Notes Module · 013 — 数据源契约（source 列）
--
-- 给所有 axis 表加 source 列，区分两条数据源：
--   - llm_extracted：runEngine LLM 抽取产出（默认）
--   - manual_import：scripts/import-*.mjs 等人工聚合 JSON 导入
--   - human_edit：用户在 UI 上手工改的（保留枚举，未来用）
--   - restored：从 mn_axis_versions 回滚写回的（P3 用）
--
-- 配套 computer 改动：DELETE / UPDATE 加 `AND source = 'llm_extracted'` 守护，
-- 让 LLM 重算只删自己产出的行，从契约层根治"覆盖人工数据"问题。

-- ============================================================
-- People axis
-- ============================================================
ALTER TABLE mn_commitments
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_role_trajectory_points
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_speech_quality
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_silence_signals
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

-- ============================================================
-- Projects axis
-- ============================================================
ALTER TABLE mn_decisions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_assumptions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_open_questions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_risks
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

-- ============================================================
-- Knowledge axis
-- ============================================================
ALTER TABLE mn_judgments
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_mental_model_invocations
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_cognitive_biases
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_counterfactuals
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_evidence_grades
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

-- ============================================================
-- Meta axis (singleton tables)
-- ============================================================
ALTER TABLE mn_decision_quality
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_meeting_necessity
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

ALTER TABLE mn_affect_curve
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'llm_extracted'
  CHECK (source IN ('llm_extracted','manual_import','human_edit','restored'));

-- ============================================================
-- Backfill：识别 manual_import 行
-- 依据：人工导入脚本在 metadata / evidence_refs 里写了固定 src_id 前缀
-- ============================================================
UPDATE mn_commitments     SET source = 'manual_import' WHERE evidence_refs->>'src_id' LIKE 'K-%';
UPDATE mn_decisions       SET source = 'manual_import' WHERE metadata->>'src_id' LIKE 'D-%';
UPDATE mn_assumptions     SET source = 'manual_import' WHERE metadata->>'src_id' LIKE 'AS-%';
UPDATE mn_open_questions  SET source = 'manual_import' WHERE metadata->>'src_id' LIKE 'Q-%';
UPDATE mn_risks           SET source = 'manual_import' WHERE metadata->>'src_id' LIKE 'R-%';
UPDATE mn_judgments       SET source = 'manual_import' WHERE metadata->>'src_id' LIKE 'J-%';

-- 没有 src_id 标记的表：按 mn_speech_quality.sample_quotes 里的 name_in_json 字段识别
-- （import 脚本写入这个 key，LLM computer 写 [{turn:..., text:...}] 数组结构没有 name_in_json）
UPDATE mn_speech_quality
   SET source = 'manual_import'
 WHERE jsonb_typeof(sample_quotes) = 'object'
   AND sample_quotes ? 'name_in_json';

-- mn_role_trajectory_points / mn_silence_signals / 4 个 meta singleton：
-- 这些表 import 脚本没留显式标记，但项目层面只在两个 sh-ai meeting 上手工导入过；
-- 按 meeting_id 列表 + 信号区分（silence 用 anomaly_score=70 准确度高）
DO $$
DECLARE
  manual_meeting_ids uuid[] := ARRAY[
    '1ace56ff-1eeb-48d9-8f6b-e3070d9338a4'::uuid,  -- M-SH-2026-03-31-AI-KICKOFF
    'eff87d6c-efdd-4dc9-92a4-a8585b62a53c'::uuid   -- M-SH-2026-04-XX-AI-01
  ];
BEGIN
  -- silence_signals: import 写 anomaly_score=70 + state='abnormal_silence'，LLM 写 state='abnormal_silence' 时 anomaly_score 通常算出来不是整数 70
  UPDATE mn_silence_signals
     SET source = 'manual_import'
   WHERE meeting_id = ANY(manual_meeting_ids)
     AND anomaly_score = 70.00;

  -- role_trajectory_points: 没有强信号；按 meeting_id 限定 + confidence=0.8（import 固定值）
  UPDATE mn_role_trajectory_points
     SET source = 'manual_import'
   WHERE meeting_id = ANY(manual_meeting_ids)
     AND confidence = 0.80;

  -- meta singleton: 直接按 meeting_id 标记（这两场会议的 meta 都是 import 进来的）
  UPDATE mn_decision_quality   SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);
  UPDATE mn_meeting_necessity  SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);
  UPDATE mn_affect_curve       SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);
  UPDATE mn_evidence_grades    SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);

  -- knowledge 三个非数组型表（mental_model_invocations / cognitive_biases / counterfactuals）
  -- 同样按 meeting_id 限定（import 在这两场写了 7 + 7 + 6 行）
  UPDATE mn_mental_model_invocations  SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);
  UPDATE mn_cognitive_biases          SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);
  UPDATE mn_counterfactuals           SET source = 'manual_import' WHERE meeting_id = ANY(manual_meeting_ids);
END $$;

-- ============================================================
-- Indexes：(source, meeting_id) 复合索引便于 LLM computer 的 DELETE 用上
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mn_commitments_source_meeting
  ON mn_commitments(source, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_decisions_source_meeting
  ON mn_decisions(source, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_assumptions_source_meeting
  ON mn_assumptions(source, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_judgments_source
  ON mn_judgments(source);
CREATE INDEX IF NOT EXISTS idx_mn_risks_source_scope
  ON mn_risks(source, scope_id);

-- ============================================================
-- Rollback (manual)
-- ============================================================
-- ALTER TABLE mn_commitments DROP COLUMN source;
-- ALTER TABLE mn_role_trajectory_points DROP COLUMN source;
-- ALTER TABLE mn_speech_quality DROP COLUMN source;
-- ALTER TABLE mn_silence_signals DROP COLUMN source;
-- ALTER TABLE mn_decisions DROP COLUMN source;
-- ALTER TABLE mn_assumptions DROP COLUMN source;
-- ALTER TABLE mn_open_questions DROP COLUMN source;
-- ALTER TABLE mn_risks DROP COLUMN source;
-- ALTER TABLE mn_judgments DROP COLUMN source;
-- ALTER TABLE mn_mental_model_invocations DROP COLUMN source;
-- ALTER TABLE mn_cognitive_biases DROP COLUMN source;
-- ALTER TABLE mn_counterfactuals DROP COLUMN source;
-- ALTER TABLE mn_evidence_grades DROP COLUMN source;
-- ALTER TABLE mn_decision_quality DROP COLUMN source;
-- ALTER TABLE mn_meeting_necessity DROP COLUMN source;
-- ALTER TABLE mn_affect_curve DROP COLUMN source;

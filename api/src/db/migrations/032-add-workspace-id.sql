-- 032-add-workspace-id.sql
-- 账号体系第 2 期 · 第一刀：给 P0 业务表加 nullable 的 workspace_id 列 + 索引
--
-- 原则:
--   1) 完全幂等 (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)，可反复执行
--   2) 列暂时 nullable —— 不影响任何现有读写
--   3) 不回填数据 (那是 033)；不 SET NOT NULL (那是 034)
--   4) 应用代码这一步零改动 —— 即使部署后也不影响业务
--   5) 对当前 DB 不存在的表自动跳过 (按 pg_tables 条件 EXECUTE)，
--      让该 SQL 同时适配 dev/staging/prod 即使各自缺一些功能表
--
-- 回滚: 对每张表执行 ALTER TABLE <t> DROP COLUMN IF EXISTS workspace_id
--
-- 依赖: 031-auth-foundation.sql 已先建好 workspaces 表

BEGIN;

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    -- P0 平表
    'tasks','assets','unified_topics','community_topics','hot_topics',
    'meeting_note_sources','meeting_note_imports',
    'expert_profiles','expert_reviews','expert_review_tasks',
    'review_chains','review_reports',
    'outline_versions','outline_generation_progress',
    'draft_versions','draft_annotations','draft_change_logs','draft_chat_sessions',
    'compliance_logs','content_predictions','scheduled_publishes',
    'rss_sources','rss_items',
    'favorite_reports','user_hot_topic_follows',
    'copilot_sessions','copilot_messages','copilot_contexts','copilot_usage_stats',
    -- mn_* 会议纪要相关
    'mn_affect_curve','mn_assumptions','mn_axis_versions','mn_belief_drift_series',
    'mn_cognitive_biases','mn_commitments','mn_consensus_items','mn_consensus_sides',
    'mn_counterfactuals','mn_cross_axis_links','mn_decision_quality',
    'mn_decision_tree_snapshots','mn_decisions','mn_evidence_grades',
    'mn_focus_map','mn_judgments','mn_meeting_necessity',
    'mn_mental_model_hit_stats','mn_mental_model_invocations',
    'mn_open_questions','mn_people','mn_risks','mn_role_trajectory_points',
    'mn_runs','mn_schedules','mn_scope_members','mn_scopes',
    'mn_silence_signals','mn_speech_quality','mn_tension_moments','mn_tensions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id)',
        t
      );
    ELSE
      RAISE NOTICE '[032] table % missing on this DB — skipped', t;
    END IF;
  END LOOP;
END $$;

-- 关键热表索引；冷 mn_* 暂不建索引，等 033 回填 + ANALYZE 再按真实查询补
DO $$
DECLARE
  t TEXT;
  hot_tables TEXT[] := ARRAY[
    'tasks','assets','unified_topics','community_topics','hot_topics',
    'meeting_note_sources','meeting_note_imports',
    'expert_profiles','expert_reviews','expert_review_tasks',
    'review_chains','review_reports',
    'outline_versions','outline_generation_progress',
    'draft_versions','draft_annotations','draft_change_logs','draft_chat_sessions',
    'compliance_logs','content_predictions','scheduled_publishes',
    'rss_sources','rss_items',
    'favorite_reports','user_hot_topic_follows',
    'copilot_sessions','copilot_messages','copilot_contexts','copilot_usage_stats',
    'mn_runs','mn_scopes','mn_schedules','mn_axis_versions',
    'mn_people','mn_decisions','mn_commitments','mn_open_questions'
  ];
BEGIN
  FOREACH t IN ARRAY hot_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I(workspace_id)',
        'idx_' || t || '_workspace',
        t
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- 验证：所有应有 workspace_id 列的表
-- SELECT table_name FROM information_schema.columns
-- WHERE column_name='workspace_id' AND table_schema='public' ORDER BY table_name;

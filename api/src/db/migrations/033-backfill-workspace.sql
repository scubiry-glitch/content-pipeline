-- 033-backfill-workspace.sql
-- 账号体系第 2 期 · 第二刀：把所有现有行回填到 Default workspace
--
-- 原则:
--   1) 通过 slug='default' 动态查 default workspace ID（不硬编码 UUID）
--   2) 只 UPDATE workspace_id IS NULL 的行（已回填的不动）
--   3) 仍在事务里，执行后立即 SELECT 验证 0 NULL
--   4) 走 032 已加的同一批 51 张表 (按存在性条件 EXECUTE)
--
-- 回滚: UPDATE <table> SET workspace_id = NULL WHERE workspace_id = '<default-uuid>';
--      但回滚前必须先把 034 的 NOT NULL 撤掉。
--
-- 依赖: 032-add-workspace-id.sql 已先建好列；workspaces 中存在 slug='default' 一行。

BEGIN;

DO $$
DECLARE
  default_ws_id UUID;
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
    -- mn_*
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
  affected_rows BIGINT;
BEGIN
  SELECT id INTO default_ws_id FROM workspaces WHERE slug = 'default' LIMIT 1;
  IF default_ws_id IS NULL THEN
    RAISE EXCEPTION '[033] default workspace (slug=default) not found — run 031 + setupAuthSchema first';
  END IF;
  RAISE NOTICE '[033] backfilling to default workspace %', default_ws_id;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='workspace_id') THEN
      EXECUTE format(
        'UPDATE %I SET workspace_id = $1 WHERE workspace_id IS NULL',
        t
      ) USING default_ws_id;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      IF affected_rows > 0 THEN
        RAISE NOTICE '[033] % → backfilled % rows', t, affected_rows;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Dry-run 验证：所有应有 workspace_id 的表里 NULL 行数应 = 0
-- 在 034 执行 SET NOT NULL 之前必须看到这个查询结果为空
-- SELECT table_name FROM information_schema.columns
-- WHERE column_name='workspace_id' AND table_schema='public' AND table_name <> 'workspace_members';

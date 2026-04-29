-- 038-drop-workspace-id-default.sql
-- 仅在 trigger 覆盖的子表上 DROP DEFAULT (workspace_id)
--
-- 配合 037 (BEFORE INSERT trigger 从父表派生 workspace_id):
--   - DEFAULT 在 trigger 之前填充, 导致 NEW.workspace_id 永不为 NULL, trigger 失效
--   - DROP DEFAULT 后, 不传 workspace_id 的 INSERT → NEW.workspace_id IS NULL → trigger 派生 → 成功
--   - 派生不到父表 (孤儿) → workspace_id 仍 NULL → NOT NULL 约束抛错 (符合预期, 暴露错误)
--
-- 不在此次 DROP 范围 (保留 DEFAULT 兜底):
--   tasks / assets / unified_topics / community_topics / hot_topics
--   rss_items / rss_sources / meeting_note_sources / expert_profiles
--   favorite_reports / compliance_logs / mn_runs / mn_scopes / mn_schedules
--   mn_consensus_sides / mn_judgments / mn_people / mn_tension_moments / user_hot_topic_follows
--
-- 这些"独立表"的 INSERT 路径大量来自 RSS collector / 后台 job / 种子脚本等不易追踪的位置,
-- 现阶段保留 DEFAULT 兜底防止业务停摆.

BEGIN;

DO $$
DECLARE
  t TEXT;
  -- 与 037 trigger 列表完全一致 (32 张子表)
  covered TEXT[] := ARRAY[
    -- meeting_id 单父
    'mn_affect_curve','mn_cognitive_biases','mn_commitments','mn_consensus_items',
    'mn_counterfactuals','mn_decision_quality','mn_evidence_grades','mn_focus_map',
    'mn_meeting_necessity','mn_mental_model_invocations','mn_silence_signals',
    'mn_speech_quality',
    -- scope_id 单父
    'mn_axis_versions','mn_belief_drift_series','mn_cross_axis_links',
    'mn_decision_tree_snapshots','mn_mental_model_hit_stats',
    'mn_open_questions','mn_risks',
    -- meeting_id + scope_id 双父
    'mn_decisions','mn_assumptions','mn_role_trajectory_points',
    'mn_scope_members','mn_tensions',
    -- task_id 父
    'draft_versions','expert_reviews','expert_review_tasks',
    'review_chains','review_reports',
    'outline_versions','outline_generation_progress',
    -- source_id 父
    'meeting_note_imports'
  ];
BEGIN
  FOREACH t IN ARRAY covered LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t)
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name=t AND column_name='workspace_id'
       )
    THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id DROP DEFAULT', t);
      RAISE NOTICE '[038] %: DROP DEFAULT applied', t;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- 验证: 这些子表的 column_default 应为空
-- SELECT table_name, column_default FROM information_schema.columns
--  WHERE column_name='workspace_id' AND table_schema='public'
--    AND column_default IS NOT NULL ORDER BY table_name;

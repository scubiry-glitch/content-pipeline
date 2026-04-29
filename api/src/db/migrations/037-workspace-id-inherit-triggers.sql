-- 037-workspace-id-inherit-triggers.sql
-- BEFORE INSERT trigger: 子表 workspace_id 为 NULL 时, 从父表 (assets/mn_scopes/tasks
-- /meeting_note_sources) 抄过来. 这是 DROP DEFAULT 之前的安全网, 让 50+ 个不传
-- workspace_id 的 INSERT 站点继续工作.
--
-- 父类:
--   assets               <- meeting_id 列
--   mn_scopes            <- scope_id 列
--   tasks                <- task_id 列
--   meeting_note_sources <- source_id 列
--
-- 设计原则:
--   - 仅在 NEW.workspace_id IS NULL 时填; 显式传值的代码路径不受影响
--   - 父表查不到时不报错, 让 NOT NULL 约束最终拦截 (DROP DEFAULT 后)
--   - 多父表场景 (mn_decisions 同时有 meeting_id + scope_id) 优先 meeting_id

BEGIN;

-- ============================================================
-- Trigger 函数
-- ============================================================

CREATE OR REPLACE FUNCTION inherit_ws_from_meeting() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.meeting_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM assets WHERE id::text = NEW.meeting_id::text LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.scope_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM mn_scopes WHERE id = NEW.scope_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_meeting_or_scope() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.meeting_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM assets WHERE id::text = NEW.meeting_id::text LIMIT 1;
  END IF;
  IF NEW.workspace_id IS NULL AND NEW.scope_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM mn_scopes WHERE id = NEW.scope_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_task() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.task_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM tasks WHERE id::text = NEW.task_id::text LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_source() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.source_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM meeting_note_sources WHERE id = NEW.source_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 挂 trigger (CREATE OR REPLACE 不支持 CREATE TRIGGER, 用 DROP IF EXISTS + CREATE 实现幂等)
-- ============================================================

-- meeting_id 派生 (单父)
DO $$
DECLARE
  t TEXT;
  meeting_only TEXT[] := ARRAY[
    'mn_affect_curve','mn_cognitive_biases','mn_commitments','mn_consensus_items',
    'mn_counterfactuals','mn_decision_quality','mn_evidence_grades','mn_focus_map',
    'mn_meeting_necessity','mn_mental_model_invocations','mn_silence_signals',
    'mn_speech_quality'
  ];
BEGIN
  FOREACH t IN ARRAY meeting_only LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ws_inherit ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_meeting()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- scope_id 派生 (单父)
DO $$
DECLARE
  t TEXT;
  scope_only TEXT[] := ARRAY[
    'mn_axis_versions','mn_belief_drift_series','mn_cross_axis_links',
    'mn_decision_tree_snapshots','mn_mental_model_hit_stats',
    'mn_open_questions','mn_risks'
  ];
BEGIN
  FOREACH t IN ARRAY scope_only LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ws_inherit ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_scope()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- meeting_id 优先, scope_id 兜底 (双父)
DO $$
DECLARE
  t TEXT;
  meet_or_scope TEXT[] := ARRAY[
    'mn_decisions','mn_assumptions','mn_role_trajectory_points',
    'mn_scope_members','mn_tensions'
  ];
BEGIN
  FOREACH t IN ARRAY meet_or_scope LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ws_inherit ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_meeting_or_scope()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- task_id 派生
DO $$
DECLARE
  t TEXT;
  task_parent TEXT[] := ARRAY[
    'draft_versions','expert_reviews','expert_review_tasks',
    'review_chains','review_reports',
    'outline_versions','outline_generation_progress'
  ];
BEGIN
  FOREACH t IN ARRAY task_parent LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ws_inherit ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_task()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- source_id 派生
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='meeting_note_imports') THEN
    DROP TRIGGER IF EXISTS trg_ws_inherit ON meeting_note_imports;
    CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON meeting_note_imports
      FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_source();
  END IF;
END $$;

COMMIT;

-- 孤儿表 (无清晰父表): mn_consensus_sides / mn_judgments / mn_people / mn_tension_moments
-- / user_hot_topic_follows — 这些保留 DEFAULT 兜底, 不上 trigger.

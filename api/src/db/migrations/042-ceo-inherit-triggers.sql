-- 042-ceo-inherit-triggers.sql
-- 给 ceo_* 业务表加 BEFORE INSERT trigger, 让 INSERT 时若漏传 workspace_id
-- 自动从父表 (mn_scopes / ceo_strategic_lines / ceo_directors / ceo_briefs / ceo_stakeholders)
-- 抄过来. 这是 NOT NULL (043 收口) 之前的安全网, 让既有不传 workspace_id
-- 的 INSERT 站点继续工作.
--
-- 设计 (对齐 mn 037):
--   - 仅在 NEW.workspace_id IS NULL 时填; 显式传值的代码路径不受影响
--   - 父表查不到时不报错, 让 NOT NULL 约束最终拦截 (043 后)
--   - 4 张无父表的纯 user/person 表 (ceo_prism_weights / ceo_balcony_reflections /
--     ceo_time_roi / ceo_person_agent_links) 不挂 trigger, 由 service 层显式传 wsId
--
-- 父类映射:
--   mn_scopes              <- scope_id 列 (沿用 037 的 inherit_ws_from_scope)
--   ceo_strategic_lines    <- line_id 列  (新函数 inherit_ws_from_ceo_line)
--   ceo_directors          <- director_id (新函数 inherit_ws_from_ceo_director)
--   ceo_briefs             <- brief_id    (新函数 inherit_ws_from_ceo_brief)
--   ceo_stakeholders       <- stakeholder_id (新函数 inherit_ws_from_ceo_stakeholder)

BEGIN;

-- ============================================================
-- Trigger 函数 (4 个新的, ceo 内部父表)
-- ============================================================

CREATE OR REPLACE FUNCTION inherit_ws_from_ceo_line() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.line_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM ceo_strategic_lines WHERE id = NEW.line_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_ceo_director() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.director_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM ceo_directors WHERE id = NEW.director_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_ceo_brief() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.brief_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM ceo_briefs WHERE id = NEW.brief_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_ceo_stakeholder() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.stakeholder_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM ceo_stakeholders WHERE id = NEW.stakeholder_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 挂 trigger
-- (DROP IF EXISTS + CREATE TRIGGER 实现幂等)
-- ============================================================

-- 1) 直接挂 scope_id 的 13 张表 → 复用 037 的 inherit_ws_from_scope
DO $$
DECLARE
  t TEXT;
  scope_tables TEXT[] := ARRAY[
    'ceo_prisms',
    'ceo_strategic_lines',
    'ceo_attention_alloc',
    'ceo_directors',
    'ceo_briefs',
    'ceo_rebuttal_rehearsals',
    'ceo_decisions',
    'ceo_stakeholders',
    'ceo_rubric_scores',
    'ceo_formation_snapshots',
    'ceo_war_room_sparks',
    'ceo_sandbox_runs',
    'ceo_boardroom_annotations'
  ];
BEGIN
  FOREACH t IN ARRAY scope_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_ws_inherit ON %I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_scope()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- 2) line_id 派生 (单父)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ceo_strategic_echos') THEN
    DROP TRIGGER IF EXISTS trg_ws_inherit ON ceo_strategic_echos;
    CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON ceo_strategic_echos
      FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_ceo_line();
  END IF;
END $$;

-- 3) director_id 派生 (单父)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ceo_director_concerns') THEN
    DROP TRIGGER IF EXISTS trg_ws_inherit ON ceo_director_concerns;
    CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON ceo_director_concerns
      FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_ceo_director();
  END IF;
END $$;

-- 4) brief_id 派生 (单父)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ceo_board_promises') THEN
    DROP TRIGGER IF EXISTS trg_ws_inherit ON ceo_board_promises;
    CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON ceo_board_promises
      FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_ceo_brief();
  END IF;
END $$;

-- 5) stakeholder_id 派生 (单父)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='ceo_external_signals') THEN
    DROP TRIGGER IF EXISTS trg_ws_inherit ON ceo_external_signals;
    CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON ceo_external_signals
      FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_ceo_stakeholder();
  END IF;
END $$;

COMMIT;

-- 不上 trigger 的 4 张表 (纯 user/person, 无可派生父表):
--   ceo_prism_weights         (user_id 区分)
--   ceo_balcony_reflections   (user_id 区分)
--   ceo_time_roi              (user_id 区分)
--   ceo_person_agent_links    (person_id 区分)
-- 这 4 张表的 INSERT 必须由 service 层显式传 workspace_id (改动 2 service 部分实现).

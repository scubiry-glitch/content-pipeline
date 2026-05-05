-- 041-ceo-workspace-id.sql
-- 给 21 张 ceo_* 业务表加 nullable 的 workspace_id 列 + 索引 + backfill 到 default workspace.
--
-- 原则 (对齐 mn 的 032+033):
--   1) 完全幂等 (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / WHERE workspace_id IS NULL)
--   2) 列暂时 nullable —— 不影响任何现有读写 (NOT NULL 在后续迁移收口)
--   3) 同事务 backfill：通过 slug='default' 动态查 default workspace ID (不硬编码 UUID)
--   4) 应用代码这一步零改动 —— 即使部署后也不影响业务
--   5) 对当前 DB 不存在的表自动跳过 (按 pg_tables 条件 EXECUTE)，
--      让该 SQL 同时适配 dev/staging/prod 即使各自缺一些功能表
--
-- 回滚：
--   对每张表执行 ALTER TABLE <t> DROP COLUMN IF EXISTS workspace_id
--   (NOT NULL 约束尚未加，故无需先撤销约束)
--
-- 依赖:
--   - 031-auth-foundation.sql + setupAuthSchema 已建好 workspaces 表，且存在 slug='default' 一行
--   - api/src/modules/ceo/migrations/001-009 已先建好 21 张 ceo_* 表 (启动时 ensureCeoModuleSchema 自动跑)

BEGIN;

DO $$
DECLARE
  default_ws_id UUID;
  t TEXT;
  tables TEXT[] := ARRAY[
    -- 001-prism-and-rooms
    'ceo_prisms', 'ceo_prism_weights',
    -- 002-room-metrics
    'ceo_strategic_lines', 'ceo_strategic_echos',
    'ceo_attention_alloc', 'ceo_directors', 'ceo_director_concerns',
    -- 003-annotations-and-briefs
    'ceo_briefs', 'ceo_board_promises',
    'ceo_rebuttal_rehearsals', 'ceo_decisions',
    -- 004-stakeholders
    'ceo_stakeholders', 'ceo_external_signals',
    'ceo_rubric_scores', 'ceo_formation_snapshots',
    -- 005-balcony-reflections
    'ceo_balcony_reflections', 'ceo_time_roi',
    -- 006-person-agent-links
    'ceo_person_agent_links',
    -- 007-war-room-sparks
    'ceo_war_room_sparks',
    -- 008-sandbox-runs
    'ceo_sandbox_runs',
    -- 009-ceo-annotations
    'ceo_boardroom_annotations'
  ];
  affected_rows BIGINT;
BEGIN
  -- ============================================================
  -- 1) 加列 + 索引
  -- ============================================================
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id)',
        t
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I(workspace_id)',
        'idx_' || t || '_workspace',
        t
      );
    ELSE
      RAISE NOTICE '[041] table % missing on this DB — skipped', t;
    END IF;
  END LOOP;

  -- ============================================================
  -- 2) backfill 到 default workspace
  -- ============================================================
  SELECT id INTO default_ws_id FROM workspaces WHERE slug = 'default' LIMIT 1;
  IF default_ws_id IS NULL THEN
    RAISE EXCEPTION '[041] default workspace (slug=default) not found — run 031-auth-foundation + setupAuthSchema first';
  END IF;
  RAISE NOTICE '[041] backfilling to default workspace %', default_ws_id;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'workspace_id'
    ) THEN
      EXECUTE format(
        'UPDATE %I SET workspace_id = $1 WHERE workspace_id IS NULL',
        t
      ) USING default_ws_id;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      IF affected_rows > 0 THEN
        RAISE NOTICE '[041] % → backfilled % rows', t, affected_rows;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- 验证 (跑完后人肉确认 NULL 计数 = 0):
--   SELECT table_name, (
--     SELECT count(*)
--       FROM (SELECT workspace_id FROM <table> WHERE workspace_id IS NULL) sub
--   ) AS null_rows
--   FROM information_schema.columns
--   WHERE column_name='workspace_id' AND table_name LIKE 'ceo_%';

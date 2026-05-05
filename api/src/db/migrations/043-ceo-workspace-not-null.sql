-- 043-ceo-workspace-not-null.sql
-- 收口: 给 21 张 ceo_* 表的 workspace_id 加 NOT NULL + 触发 RLS policy 覆盖.
--
-- 前置:
--   041 已加 nullable 列 + backfill 到 default workspace
--   042 已挂 inherit-ws trigger 给 17 张表 (4 张 user/person 表由 service 层显式传)
--   改动 2 production code 已经在写入路径上传 workspace_id (或带 scope_id 让 trigger 兜底)
--
-- 设计:
--   1) 每张表先 SELECT count NULL — 任意 table NULL > 0 直接 RAISE EXCEPTION,
--      避免 SET NOT NULL 跑到一半留下半成品状态
--   2) 走完 NOT NULL 后再次跑 039 同款的 RLS DO block 通用扫描 —
--      它按 information_schema 列名为 workspace_id 的表自动建 policy, 无需逐表硬编码
--   3) 完全幂等: 多次 ALTER ... SET NOT NULL 不报错; DROP POLICY IF EXISTS + CREATE POLICY
--      也允许重跑

BEGIN;

DO $$
DECLARE
  default_ws_id UUID;
  t TEXT;
  tables TEXT[] := ARRAY[
    'ceo_prisms', 'ceo_prism_weights',
    'ceo_strategic_lines', 'ceo_strategic_echos',
    'ceo_attention_alloc', 'ceo_directors', 'ceo_director_concerns',
    'ceo_briefs', 'ceo_board_promises',
    'ceo_rebuttal_rehearsals', 'ceo_decisions',
    'ceo_stakeholders', 'ceo_external_signals',
    'ceo_rubric_scores', 'ceo_formation_snapshots',
    'ceo_balcony_reflections', 'ceo_time_roi',
    'ceo_person_agent_links',
    'ceo_war_room_sparks', 'ceo_sandbox_runs',
    'ceo_boardroom_annotations'
  ];
  null_count BIGINT;
  affected BIGINT;
BEGIN
  -- 1) 二次 backfill 兜底: 041 跑过之后到 043 之间, 若有路径漏传 workspace_id
  --    (例如 scope_id=null 的 g5-prism-aggregator 早期版本写入), 这里再扫一遍
  --    把 NULL 行回填到 default workspace.
  SELECT id INTO default_ws_id FROM workspaces WHERE slug = 'default' LIMIT 1;
  IF default_ws_id IS NULL THEN
    RAISE EXCEPTION '[043] default workspace (slug=default) not found';
  END IF;

  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='workspace_id'
    ) THEN
      EXECUTE format('UPDATE %I SET workspace_id = $1 WHERE workspace_id IS NULL', t)
        USING default_ws_id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected > 0 THEN
        RAISE NOTICE '[043] secondary backfill on % → % rows', t, affected;
      END IF;
    END IF;
  END LOOP;

  -- 2) 体检: 至此 21 张表 workspace_id IS NULL 必须全为 0
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='workspace_id'
    ) THEN
      EXECUTE format('SELECT count(*) FROM %I WHERE workspace_id IS NULL', t)
        INTO null_count;
      IF null_count > 0 THEN
        RAISE EXCEPTION '[043] table % still has % rows with workspace_id IS NULL after secondary backfill', t, null_count;
      END IF;
    END IF;
  END LOOP;

  -- 3) SET NOT NULL
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='workspace_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ALTER COLUMN workspace_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- 3) RLS policy 通用扫描 (与 039 同体, 这里再跑一遍是为了把 041 后新增 workspace_id 列
--    的 ceo_* 表也纳入 ws_isolation policy. 已有 policy 的表 DROP IF EXISTS 后重建,
--    不会引入语义变化.)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE column_name='workspace_id' AND table_schema='public'
       AND table_name <> 'workspace_members'
       AND table_name LIKE 'ceo_%'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY ws_isolation ON %I
        FOR ALL TO PUBLIC
        USING (
          current_setting('app.workspace_id', TRUE) IS NULL
          OR current_setting('app.workspace_id', TRUE) = ''
          OR workspace_id::text = current_setting('app.workspace_id', TRUE)
          OR workspace_id IN (SELECT id FROM _shared_workspace_ids)
        )
        WITH CHECK (
          current_setting('app.workspace_id', TRUE) IS NULL
          OR current_setting('app.workspace_id', TRUE) = ''
          OR workspace_id::text = current_setting('app.workspace_id', TRUE)
        )
    $p$, t);
  END LOOP;
END $$;

COMMIT;

-- 验证:
--   SELECT table_name, is_nullable FROM information_schema.columns
--    WHERE column_name='workspace_id' AND table_name LIKE 'ceo_%';
--   -- 期望 is_nullable='NO' 全部 21 张
--
--   SELECT tablename, policyname FROM pg_policies WHERE tablename LIKE 'ceo_%';
--   -- 期望每张 ceo 表都有 ws_isolation policy

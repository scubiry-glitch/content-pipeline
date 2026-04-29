-- 034-enforce-workspace-not-null.sql
-- 账号体系第 2 期 · 第三刀：给 workspace_id 加 NOT NULL + DEFAULT
--
-- 关键设计:
--   每张目标表 ALTER 顺序 = SET DEFAULT (先) → SET NOT NULL (后)
--   DEFAULT 值 = default workspace 的 UUID（动态查 slug='default' 拿到）。
--   这样未改造的旧路由 INSERT 不传 workspace_id 时也能写入(自动落到 default ws)，
--   避免业务停摆；新路由改成 scopedQuery 后会显式传值，DEFAULT 不触发。
--
--   依赖隐性约束: default workspace 不可删除。后续在 routes/workspaces.ts 的 DELETE
--   handler 里加 short-circuit 防止误删（slug='default' 拒绝）。
--
-- 前置: 033 已把所有行回填，dry-run = 0 NULL。
-- 前置: workspaces 中存在 slug='default' 一行。
-- 回滚: ALTER TABLE <t> ALTER COLUMN workspace_id DROP NOT NULL, ALTER COLUMN workspace_id DROP DEFAULT;

BEGIN;

DO $$
DECLARE
  default_ws_id UUID;
  t TEXT;
  null_check BIGINT;
  total_remaining_nulls BIGINT := 0;
BEGIN
  SELECT id INTO default_ws_id FROM workspaces WHERE slug = 'default' LIMIT 1;
  IF default_ws_id IS NULL THEN
    RAISE EXCEPTION '[034] default workspace not found';
  END IF;

  -- 1) 安全检查：扫所有目标表确保确实 0 NULL
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name='workspace_id' AND table_schema='public'
      AND table_name NOT IN ('workspace_members')  -- workspace_members.workspace_id 已是 NOT NULL PK
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE workspace_id IS NULL', t) INTO null_check;
    IF null_check > 0 THEN
      RAISE NOTICE '[034] BLOCKED: % still has % NULL rows', t, null_check;
      total_remaining_nulls := total_remaining_nulls + null_check;
    END IF;
  END LOOP;

  IF total_remaining_nulls > 0 THEN
    RAISE EXCEPTION '[034] aborting: % rows across tables are NULL — run 033 first', total_remaining_nulls;
  END IF;

  RAISE NOTICE '[034] safety check passed: 0 NULL rows; default ws = %', default_ws_id;

  -- 2) 给每张目标表加 DEFAULT + NOT NULL
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name='workspace_id' AND table_schema='public'
      AND table_name NOT IN ('workspace_members')
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN workspace_id SET DEFAULT %L',
      t, default_ws_id
    );
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN workspace_id SET NOT NULL',
      t
    );
    RAISE NOTICE '[034] %: DEFAULT + NOT NULL applied', t;
  END LOOP;
END $$;

COMMIT;

-- 验证：所有目标表的 workspace_id 列既 NOT NULL 又有 DEFAULT
-- SELECT table_name, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE column_name='workspace_id' AND table_schema='public' ORDER BY table_name;

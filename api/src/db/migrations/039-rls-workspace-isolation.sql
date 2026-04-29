-- 039-rls-workspace-isolation.sql
-- PostgreSQL Row-Level Security: 应用层兜底
--
-- 策略 (默认放行): 当 GUC `app.workspace_id` 没设时, RLS 视为通过
-- → 现有所有代码路径不受影响 (零行为变化).
-- 当应用通过 `SET LOCAL app.workspace_id = '<uuid>'` 后, RLS 强制只能看到:
--   - 该 ws 的行
--   - 任意 is_shared=true 的 ws 的行 (现 default ws 即归属此类)
--
-- ENABLE + FORCE 一起用: 即使 owner 也被限制 (符合"opt-in 强制隔离"语义).
--
-- 应用侧使用方式 (db/repos/withWorkspace.ts):
--   await withWorkspaceTx(req.auth.workspace.id, async (client) => {
--     await client.query('SELECT ... FROM tasks WHERE ...');
--     // RLS 自动只返回 当前 ws + shared ws 的行
--   });

BEGIN;

-- 共享 ws id 缓存视图 (避免每行求值都走 SELECT)
-- 后期 is_shared 变化时, 视图自动反映 (因为是普通 view)
CREATE OR REPLACE VIEW _shared_workspace_ids AS
  SELECT id FROM workspaces WHERE is_shared = TRUE;

-- 通用 RLS policy (workspace_id 列存在 + 应启用 RLS 的所有表)
-- 实现思路:
--   1) 找出所有 column_name='workspace_id' 的表
--   2) 排除 workspace_members (本身就是 workspace 维度的拓扑表, 不该再被 RLS 二次过滤)
--   3) ALTER TABLE ENABLE ROW LEVEL SECURITY + FORCE
--   4) DROP POLICY IF EXISTS + CREATE POLICY (幂等)

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
     WHERE column_name='workspace_id' AND table_schema='public'
       AND table_name <> 'workspace_members'
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
--   SET LOCAL app.workspace_id = '<other-ws-id>';  SELECT * FROM tasks;  -- 仅看 other ws + shared
--   RESET app.workspace_id;                          SELECT * FROM tasks;  -- 看全部 (默认放行)

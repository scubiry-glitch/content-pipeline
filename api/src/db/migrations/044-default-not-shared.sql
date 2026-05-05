-- 044-default-not-shared.sql
-- 关闭 default workspace 的全员可读 (is_shared=false), 让 default 数据回归隔离.
--
-- 反向 035 (UPDATE workspaces SET is_shared = TRUE WHERE slug = 'default'):
--   035 当时是为了"维持历史数据全员可见的现状", 把 default 标 is_shared=true,
--   导致 default 里的 demo / seed (陈汀 / Sara M. / Wei Zhao 等董事承诺、战略线、
--   利益相关方等) 通过 RLS policy 和 service 层的 is_shared 子句对所有非 default ws
--   都可读. 实测惠居上海 ws 用户在 Boardroom Promise Tracking 看到 30 条 default
--   ws 的 ceo_board_promises (mn 来源 0 · ceo 来源 30).
--
-- 修法选 A (用户决策): 直接关 default 的 is_shared.
--   - default 数据回归隔离, 仅 default ws 成员可读.
--   - service 层 SQL 仍保留 OR is_shared 子句 (commit c871750e), 不需要回滚 —
--     未来如果有真正"系统级共享" ws (e.g. 'demo-corp' / 'shared-templates'),
--     单独 INSERT INTO workspaces (..., is_shared) VALUES (..., true) 即可.
--
-- 影响范围 (所有走 (ws=current OR ws IN shared) 语义的 SQL):
--   - api/src/modules/ceo/* — commit c871750e 引入的 wsFilterClause
--   - api/src/modules/meeting-notes/router.ts — /meetings, /scopes 等 list
--   - api/src/db/repos/withWorkspace.ts — assertRowInWorkspace(mode='read')
--   - api/src/db/migrations/039 RLS policy 的 _shared_workspace_ids 视图
--
-- 验证 (跑完后):
--   SELECT slug, is_shared FROM workspaces WHERE slug = 'default';
--   -- 期望: is_shared = false
--
-- 回滚 (如果决定再次共享):
--   UPDATE workspaces SET is_shared = TRUE WHERE slug = 'default';

BEGIN;

UPDATE workspaces
   SET is_shared = FALSE
 WHERE slug = 'default'
   AND is_shared = TRUE;

-- 体检
DO $$
DECLARE
  shared_count INT;
BEGIN
  SELECT COUNT(*) INTO shared_count FROM workspaces WHERE slug = 'default' AND is_shared = TRUE;
  IF shared_count > 0 THEN
    RAISE EXCEPTION '[044] default workspace 仍 is_shared=true, UPDATE 没生效';
  END IF;
END $$;

COMMIT;

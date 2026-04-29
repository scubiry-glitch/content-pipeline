-- 035-workspace-is-shared.sql
-- 工作区"共享/隔离"开关：is_shared=true 的 ws 里所有数据对全员可读
--
-- 配合应用层在 SELECT 时做并集查询:
--   WHERE workspace_id = $current OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared)
--
-- 落地路径:
--   1) 现存 default workspace 标记 is_shared=true (维持历史数据全员可见的现状)
--   2) 新建 workspace 默认 is_shared=false (隔离)
--   3) admin 在 UI 切换开关 -> 数据可见性立即变化, 不需要数据迁移
--
-- 写仍受 workspace_members 约束 (只有成员能写, 不因为 is_shared=true 就能跨 ws 写).

BEGIN;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE;

-- default workspace 设置为共享 (维持现状: 历史数据所有人都能读)
UPDATE workspaces SET is_shared = TRUE WHERE slug = 'default' AND is_shared = FALSE;

COMMIT;

-- 验证: SELECT slug, is_shared FROM workspaces;

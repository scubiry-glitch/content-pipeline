-- Meeting Notes Module · 019 — Scope 层级（二级项目支持）
--
-- 背景：mn_scopes 当前是平铺结构（project/client/topic 三种 kind, 同 kind 下平铺）。
-- 用户反馈需要"二级项目"——即一个项目下可以有子项目（实施期 / 立项期 / 等不同阶段，
-- 或大项目下的子模块）。
--
-- 设计：parent_scope_id 自引用 + 同 kind 约束（project 子项目只能挂 project 父项目）；
-- 不强制无环检测（应用层创建时校验，schema 不做 DEFERRABLE 触发器避免开销）。
-- 当前不支持跨 kind 父子（如 project 挂 client 下），保持语义清晰。
--
-- 删除策略：父被删 → 子的 parent_scope_id 置 NULL（子 scope 升为顶层），不级联删除。
-- 这样误删父项目不会丢失子项目和其下的会议绑定。

ALTER TABLE mn_scopes
  ADD COLUMN IF NOT EXISTS parent_scope_id UUID NULL
    REFERENCES mn_scopes(id) ON DELETE SET NULL;

-- 部分索引：只索引非 NULL 行（绝大多数 scope 是顶层 NULL，避免索引膨胀）
CREATE INDEX IF NOT EXISTS idx_mn_scopes_parent
  ON mn_scopes(parent_scope_id) WHERE parent_scope_id IS NOT NULL;

-- 应用层应在 createScope 时校验:
--   1. parent.kind = child.kind（不能跨 kind 嵌套）
--   2. parent.workspace_id = child.workspace_id（如适用）
--   3. parent.id != child.id（自身不能为父）
--   4. 简单防环：parent.parent_scope_id 不能反向指向 child（仅 1 层防御）

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_mn_scopes_parent;
--   ALTER TABLE mn_scopes DROP COLUMN IF EXISTS parent_scope_id;

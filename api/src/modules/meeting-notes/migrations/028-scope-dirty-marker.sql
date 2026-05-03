-- Meeting Notes Module · 028 — mn_scopes dirty 标记
--
-- 上下文:
--   - PR5 (scheduler.ts) 把 project-auto-incremental 默认关闭以避免 4-28 那次
--     30 条 cancelled 重算事故。但 bindMeeting / unbindMeeting 之后用户没有
--     任何信号知道"该重算了"。
--   - 本 migration 给 mn_scopes 加 dirty_at / dirty_reason / last_run_id 三列，
--     由 scopeService.bindMeeting/unbindMeeting 写入；runEngine 成功完成
--     project 维度的 g4/g5/all 重算时清空。
--   - 不引入 auto-trigger；只是给 UI 一个"该重算了"的展示位 + 用户主动按钮。

ALTER TABLE mn_scopes
  ADD COLUMN IF NOT EXISTS dirty_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS dirty_reason  TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_run_id   UUID NULL;

CREATE INDEX IF NOT EXISTS idx_mn_scopes_dirty
  ON mn_scopes (dirty_at)
  WHERE dirty_at IS NOT NULL;

-- ============================================================
-- Rollback (manual):
--   DROP INDEX IF EXISTS idx_mn_scopes_dirty;
--   ALTER TABLE mn_scopes
--     DROP COLUMN IF EXISTS dirty_at,
--     DROP COLUMN IF EXISTS dirty_reason,
--     DROP COLUMN IF EXISTS last_run_id;
-- ============================================================

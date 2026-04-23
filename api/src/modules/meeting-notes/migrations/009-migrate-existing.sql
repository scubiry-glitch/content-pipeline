-- Meeting Notes Module · 009 — 吸收既有采集渠道表
-- 既有：meeting_note_sources / meeting_note_imports（来自 api/src/db/migrations/028）
-- 本模块接管 owner，表名与结构不改；仅新增 owner_scope_id 可选外键，
-- 便于按 scope 绑定默认目标（PR2+）。

-- ============================================================
-- 扩展既有 meeting_note_sources（若存在）
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_note_sources') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'meeting_note_sources' AND column_name = 'owner_scope_id'
    ) THEN
      ALTER TABLE meeting_note_sources
        ADD COLUMN owner_scope_id UUID NULL;
    END IF;

    -- FK 指向 mn_scopes，但仅在 mn_scopes 表已存在（001 已跑过）时建
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mn_scopes') THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'meeting_note_sources'
          AND constraint_name = 'meeting_note_sources_owner_scope_id_fkey'
      ) THEN
        ALTER TABLE meeting_note_sources
          ADD CONSTRAINT meeting_note_sources_owner_scope_id_fkey
          FOREIGN KEY (owner_scope_id) REFERENCES mn_scopes(id) ON DELETE SET NULL;
      END IF;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_meeting_note_sources_owner_scope
  ON meeting_note_sources(owner_scope_id)
  WHERE owner_scope_id IS NOT NULL;

-- ============================================================
-- Rollback (manual):
--   ALTER TABLE meeting_note_sources DROP CONSTRAINT IF EXISTS meeting_note_sources_owner_scope_id_fkey;
--   ALTER TABLE meeting_note_sources DROP COLUMN IF EXISTS owner_scope_id;
--   DROP INDEX IF EXISTS idx_meeting_note_sources_owner_scope;
-- ============================================================

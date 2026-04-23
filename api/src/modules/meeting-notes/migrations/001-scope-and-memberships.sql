-- Meeting Notes Module · 001 — Scope 聚合容器 + 成员关系
-- Scope = project / client / topic 三种聚合；library 是隐式全库视图，不入表
-- 参照 content-library 001 风格；所有表以 mn_ 前缀避免冲突

-- ============================================================
-- Scopes: 项目 / 客户 / 主题 三合一
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(16) NOT NULL
    CHECK (kind IN ('project', 'client', 'topic')),
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  steward_person_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS idx_mn_scopes_kind_status ON mn_scopes(kind, status);
CREATE INDEX IF NOT EXISTS idx_mn_scopes_name ON mn_scopes USING GIN (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_mn_scopes_metadata ON mn_scopes USING GIN (metadata);

-- ============================================================
-- Scope ↔ Meeting 成员关系 (N:M)
-- meeting_id 对应 assets(id) where asset_type='meeting_minutes'
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_scope_members (
  scope_id UUID NOT NULL REFERENCES mn_scopes(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bound_by UUID,
  reason TEXT,

  PRIMARY KEY (scope_id, meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_scope_members_meeting
  ON mn_scope_members(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_scope_members_scope_bound_at
  ON mn_scope_members(scope_id, bound_at DESC);

-- ============================================================
-- updated_at 自动维护（依赖已有的 update_updated_at_column()；
-- 若函数不存在则创建一份与 028 风格一致的副本）
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mn_scopes_updated_at ON mn_scopes;
CREATE TRIGGER trg_mn_scopes_updated_at
  BEFORE UPDATE ON mn_scopes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS trg_mn_scopes_updated_at ON mn_scopes;
--   DROP TABLE IF EXISTS mn_scope_members;
--   DROP TABLE IF EXISTS mn_scopes;
-- ============================================================

-- 026: Unified two-level taxonomy for /assets, /content-library, /expert-library
-- Schema only. Seed data is applied by api/src/services/taxonomyService.ts -> sync()
-- which upserts from api/src/config/taxonomyData.ts. This keeps name/icon edits
-- in source control + admin UI without requiring a new migration every time.

-- 1) taxonomy_domains: two-level catalog (level=1 primary, level=2 sub)
CREATE TABLE IF NOT EXISTS taxonomy_domains (
  code         VARCHAR(20) PRIMARY KEY,
  parent_code  VARCHAR(20) REFERENCES taxonomy_domains(code),
  name         VARCHAR(100) NOT NULL,
  level        SMALLINT NOT NULL,
  icon         VARCHAR(20),
  color        VARCHAR(20),
  sort_order   INT DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_parent ON taxonomy_domains(parent_code);
CREATE INDEX IF NOT EXISTS idx_taxonomy_active ON taxonomy_domains(is_active);

-- 2) taxonomy_audit_log: backs /admin/taxonomy history drawer
CREATE TABLE IF NOT EXISTS taxonomy_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  code        VARCHAR(20) NOT NULL,
  action      VARCHAR(20) NOT NULL,
  diff        JSONB,
  actor       VARCHAR(100),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_audit_code    ON taxonomy_audit_log(code);
CREATE INDEX IF NOT EXISTS idx_taxonomy_audit_created ON taxonomy_audit_log(created_at DESC);

-- 3) Join columns on existing tables (keep legacy `domain` / `domains` untouched)
ALTER TABLE asset_themes   ADD COLUMN IF NOT EXISTS taxonomy_code  VARCHAR(20);
ALTER TABLE assets         ADD COLUMN IF NOT EXISTS taxonomy_code  VARCHAR(20);
ALTER TABLE expert_library ADD COLUMN IF NOT EXISTS taxonomy_codes VARCHAR(20)[];

CREATE INDEX IF NOT EXISTS idx_asset_themes_taxcode ON asset_themes(taxonomy_code);
CREATE INDEX IF NOT EXISTS idx_assets_taxcode       ON assets(taxonomy_code);
CREATE INDEX IF NOT EXISTS idx_experts_taxcodes     ON expert_library USING GIN(taxonomy_codes);

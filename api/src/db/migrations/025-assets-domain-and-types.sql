-- 025: Align /assets with /content-library by domain + add new asset types
-- 1) Expand assets.type allowed values (drop old CHECK if any)
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_type_check;
ALTER TABLE assets ADD CONSTRAINT assets_type_check
  CHECK (type IN (
    'file','report','quote','data','rss_item',
    'chart','insight',
    'meeting_minutes','briefing','interview','transcript'
  ));

-- 2) asset_themes: bind each theme to a domain (defaults to theme name)
ALTER TABLE asset_themes ADD COLUMN IF NOT EXISTS domain VARCHAR(100);
UPDATE asset_themes SET domain = name WHERE domain IS NULL;
CREATE INDEX IF NOT EXISTS idx_asset_themes_domain ON asset_themes(domain);

-- 3) assets: direct domain column so assets can be classified without a theme
ALTER TABLE assets ADD COLUMN IF NOT EXISTS domain VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_assets_domain ON assets(domain);

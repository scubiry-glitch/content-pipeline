-- Migration: Hot-Topics 与 Assets 联动
-- 创建热点与素材的关联表，并扩展 assets 表支持热度字段

-- ============================================
-- 1. 创建热点与素材关联表
-- ============================================
CREATE TABLE IF NOT EXISTS hot_topic_assets (
  id SERIAL PRIMARY KEY,
  hot_topic_id VARCHAR(50) NOT NULL,  -- 对应 rss_items.id
  asset_id VARCHAR(50) NOT NULL,      -- 对应 assets.id
  match_score DECIMAL(3,2) DEFAULT 0.5,  -- 匹配度 0-1
  match_reason TEXT[] DEFAULT '{}',      -- 匹配理由数组
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 联合唯一约束，防止重复关联
  CONSTRAINT unique_hot_topic_asset UNIQUE (hot_topic_id, asset_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_hta_hot_topic ON hot_topic_assets(hot_topic_id);
CREATE INDEX IF NOT EXISTS idx_hta_asset ON hot_topic_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_hta_match_score ON hot_topic_assets(match_score DESC);

-- 添加外键约束（使用 ON DELETE CASCADE）
ALTER TABLE hot_topic_assets 
  DROP CONSTRAINT IF EXISTS fk_hta_hot_topic;
ALTER TABLE hot_topic_assets 
  ADD CONSTRAINT fk_hta_hot_topic FOREIGN KEY (hot_topic_id) REFERENCES rss_items(id) ON DELETE CASCADE;

ALTER TABLE hot_topic_assets 
  DROP CONSTRAINT IF EXISTS fk_hta_asset;
ALTER TABLE hot_topic_assets 
  ADD CONSTRAINT fk_hta_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;

-- ============================================
-- 2. 扩展 assets 表添加热度相关字段
-- ============================================

-- 热度分数 (从 rss_items.hot_score 同步)
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS hot_score INTEGER DEFAULT 0;

-- 趋势 (up/stable/down)
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS trend VARCHAR(20) DEFAULT 'stable';

-- 情感 (positive/neutral/negative)
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) DEFAULT 'neutral';

-- 热度数据最后更新时间
ALTER TABLE assets 
  ADD COLUMN IF NOT EXISTS last_hot_updated TIMESTAMP WITH TIME ZONE;

-- 创建索引加速查询
CREATE INDEX IF NOT EXISTS idx_assets_hot_score ON assets(hot_score DESC) WHERE hot_score > 0;
CREATE INDEX IF NOT EXISTS idx_assets_trend ON assets(trend);
CREATE INDEX IF NOT EXISTS idx_assets_content_type ON assets(content_type);

-- ============================================
-- 3. 创建更新时间触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_hot_topic_assets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hta_timestamp ON hot_topic_assets;
CREATE TRIGGER trigger_update_hta_timestamp
  BEFORE UPDATE ON hot_topic_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_hot_topic_assets_timestamp();

-- ============================================
-- 4. 数据迁移：同步现有 RSS 数据到 assets
-- ============================================

-- 将 rss_items 的热度数据同步到对应的 assets
UPDATE assets a
SET 
  hot_score = r.hot_score,
  trend = COALESCE(r.trend, 'stable'),
  sentiment = COALESCE(r.sentiment, 'neutral'),
  last_hot_updated = NOW()
FROM rss_items r
WHERE a.id = 'rss-' || r.id
  AND r.hot_score > 0;

-- 创建已有的 RSS-Asset 关联记录
INSERT INTO hot_topic_assets (hot_topic_id, asset_id, match_score, match_reason)
SELECT 
  r.id as hot_topic_id,
  a.id as asset_id,
  1.0 as match_score,  -- 直接导入的匹配度为 1.0
  ARRAY['direct_import']::TEXT[] as match_reason
FROM rss_items r
JOIN assets a ON a.id = 'rss-' || r.id
WHERE r.hot_score > 0
ON CONFLICT (hot_topic_id, asset_id) DO NOTHING;

-- ============================================
-- 5. 创建视图方便查询
-- ============================================

-- 热点素材综合视图
CREATE OR REPLACE VIEW v_hot_topic_assets AS
SELECT 
  hta.*,
  r.title as hot_topic_title,
  r.source_name as hot_topic_source,
  r.hot_score as hot_topic_score,
  a.title as asset_title,
  a.source as asset_source,
  a.quote_count,
  a.content_type
FROM hot_topic_assets hta
JOIN rss_items r ON hta.hot_topic_id = r.id
JOIN assets a ON hta.asset_id = a.id;

-- ============================================
-- 6. 添加注释
-- ============================================
COMMENT ON TABLE hot_topic_assets IS '热点话题与素材的关联表';
COMMENT ON COLUMN hot_topic_assets.match_score IS '匹配度分数 0-1';
COMMENT ON COLUMN hot_topic_assets.match_reason IS '匹配理由，如: direct_import, tag_match, semantic_similarity';
COMMENT ON COLUMN assets.hot_score IS '热度分数，从 rss_items 同步';
COMMENT ON COLUMN assets.trend IS '趋势: up/stable/down';
COMMENT ON COLUMN assets.sentiment IS '情感: positive/neutral/negative';

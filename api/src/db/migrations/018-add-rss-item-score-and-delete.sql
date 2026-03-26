-- RSS 文章增加人工打分和删除标记
-- 支持手动评分和软删除功能

-- 添加人工打分字段
ALTER TABLE rss_items 
ADD COLUMN IF NOT EXISTS manual_score DECIMAL(3,2) DEFAULT NULL;

-- 添加删除标记字段（软删除）
ALTER TABLE rss_items 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- 添加删除时间字段
ALTER TABLE rss_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 添加索引优化查询
CREATE INDEX IF NOT EXISTS idx_rss_items_manual_score ON rss_items(manual_score) WHERE manual_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rss_items_is_deleted ON rss_items(is_deleted) WHERE is_deleted = TRUE;
CREATE INDEX IF NOT EXISTS idx_rss_items_active ON rss_items(is_deleted, published_at) WHERE is_deleted = FALSE;

COMMENT ON COLUMN rss_items.manual_score IS '人工打分 0-1，null 表示未打分';
COMMENT ON COLUMN rss_items.is_deleted IS '软删除标记';
COMMENT ON COLUMN rss_items.deleted_at IS '删除时间';

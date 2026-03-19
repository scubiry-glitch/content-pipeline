-- Fix rss_items table - add missing columns

-- 添加缺失的列
ALTER TABLE rss_items 
ADD COLUMN IF NOT EXISTS hot_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trend VARCHAR(20) DEFAULT 'stable',
ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20) DEFAULT 'neutral';

-- 确保列存在
COMMENT ON COLUMN rss_items.hot_score IS '热度分数';
COMMENT ON COLUMN rss_items.trend IS '趋势: up/stable/down';
COMMENT ON COLUMN rss_items.sentiment IS '情感: positive/neutral/negative';

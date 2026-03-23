-- Migration: Fix rss_items hot_score column
-- 修复 rss_items 表缺少 hot_score 列的问题

-- 添加 hot_score 列（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rss_items' 
        AND column_name = 'hot_score'
    ) THEN
        ALTER TABLE rss_items ADD COLUMN hot_score INTEGER DEFAULT 0;
        RAISE NOTICE 'Added hot_score column to rss_items';
    ELSE
        RAISE NOTICE 'hot_score column already exists in rss_items';
    END IF;
END $$;

-- 添加索引（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE indexname = 'idx_rss_items_hot_score'
    ) THEN
        CREATE INDEX idx_rss_items_hot_score ON rss_items(hot_score DESC);
        RAISE NOTICE 'Created idx_rss_items_hot_score index';
    ELSE
        RAISE NOTICE 'idx_rss_items_hot_score index already exists';
    END IF;
END $$;

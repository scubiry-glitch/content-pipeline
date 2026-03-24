-- Migration: Fix missing trend column in rss_items and hot_topics tables
-- Date: 2026-03-24

-- ===== Fix rss_items table =====
DO $$
BEGIN
    -- Add trend column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rss_items' 
        AND column_name = 'trend'
    ) THEN
        ALTER TABLE rss_items ADD COLUMN trend VARCHAR(20) DEFAULT 'stable';
        RAISE NOTICE 'Added trend column to rss_items';
    ELSE
        RAISE NOTICE 'trend column already exists in rss_items';
    END IF;

    -- Add sentiment column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rss_items' 
        AND column_name = 'sentiment'
    ) THEN
        ALTER TABLE rss_items ADD COLUMN sentiment VARCHAR(20) DEFAULT 'neutral';
        RAISE NOTICE 'Added sentiment column to rss_items';
    ELSE
        RAISE NOTICE 'sentiment column already exists in rss_items';
    END IF;

    -- Add hot_score column if not exists
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

-- ===== Fix hot_topics table =====
DO $$
BEGIN
    -- Add trend column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'hot_topics' 
        AND column_name = 'trend'
    ) THEN
        ALTER TABLE hot_topics ADD COLUMN trend VARCHAR(20) DEFAULT 'stable';
        RAISE NOTICE 'Added trend column to hot_topics';
    ELSE
        RAISE NOTICE 'trend column already exists in hot_topics';
    END IF;

    -- Add sentiment column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'hot_topics' 
        AND column_name = 'sentiment'
    ) THEN
        ALTER TABLE hot_topics ADD COLUMN sentiment VARCHAR(20) DEFAULT 'neutral';
        RAISE NOTICE 'Added sentiment column to hot_topics';
    ELSE
        RAISE NOTICE 'sentiment column already exists in hot_topics';
    END IF;

    -- Add hot_score column if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'hot_topics' 
        AND column_name = 'hot_score'
    ) THEN
        ALTER TABLE hot_topics ADD COLUMN hot_score INTEGER DEFAULT 0;
        RAISE NOTICE 'Added hot_score column to hot_topics';
    ELSE
        RAISE NOTICE 'hot_score column already exists in hot_topics';
    END IF;
END $$;

-- ===== Add comments =====
COMMENT ON COLUMN rss_items.trend IS '趋势: up/stable/down';
COMMENT ON COLUMN rss_items.sentiment IS '情感: positive/neutral/negative';
COMMENT ON COLUMN rss_items.hot_score IS '热度分数';
COMMENT ON COLUMN hot_topics.trend IS '趋势: up/stable/down';
COMMENT ON COLUMN hot_topics.sentiment IS '情感: positive/neutral/negative';
COMMENT ON COLUMN hot_topics.hot_score IS '热度分数';

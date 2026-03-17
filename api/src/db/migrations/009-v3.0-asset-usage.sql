-- v3.0: 素材智能复用 - 素材引用统计
-- 创建素材引用记录表

CREATE TABLE IF NOT EXISTS asset_quotes (
    id SERIAL PRIMARY KEY,
    asset_id VARCHAR(255) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    task_id VARCHAR(255) REFERENCES production_tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_asset_quotes_asset_id ON asset_quotes(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_quotes_task_id ON asset_quotes(task_id);
CREATE INDEX IF NOT EXISTS idx_asset_quotes_created_at ON asset_quotes(created_at);

-- 添加素材表字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'quote_count') THEN
        ALTER TABLE assets ADD COLUMN quote_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'assets' AND column_name = 'last_quoted_at') THEN
        ALTER TABLE assets ADD COLUMN last_quoted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- 添加素材表索引
CREATE INDEX IF NOT EXISTS idx_assets_quote_count ON assets(quote_count DESC);
CREATE INDEX IF NOT EXISTS idx_assets_last_quoted_at ON assets(last_quoted_at DESC);

-- v3.0.3: 添加素材关联字段到 tasks 表
-- 用于支持任务与素材的关联功能

-- 添加 asset_ids 字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasks' AND column_name = 'asset_ids') THEN
        ALTER TABLE tasks ADD COLUMN asset_ids JSONB NOT NULL DEFAULT '[]';
        RAISE NOTICE 'Added asset_ids column to tasks table';
    ELSE
        RAISE NOTICE 'asset_ids column already exists in tasks table';
    END IF;
END $$;

-- 添加索引以优化素材关联查询
CREATE INDEX IF NOT EXISTS idx_tasks_asset_ids ON tasks USING GIN (asset_ids);

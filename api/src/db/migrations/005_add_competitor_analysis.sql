-- Migration: 添加竞品分析字段
-- Date: 2026-03-16

-- 添加 competitor_analysis 字段到 tasks 表
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS competitor_analysis JSONB;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_tasks_competitor ON tasks USING GIN(competitor_analysis);

-- 注释说明
COMMENT ON COLUMN tasks.competitor_analysis IS '竞品分析结果，包含同类研报、差异化建议等';

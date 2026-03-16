-- Migration: 添加选题评估字段
-- Date: 2026-03-16

-- 添加 evaluation 字段到 tasks 表
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS evaluation JSONB;

-- 添加索引以便快速查询评分范围
CREATE INDEX IF NOT EXISTS idx_tasks_evaluation ON tasks USING GIN(evaluation);

-- 注释说明
COMMENT ON COLUMN tasks.evaluation IS '选题质量评估结果，包含评分、维度分析、建议等';

-- Migration: 添加任务隐藏功能
-- Date: 2026-03-16

-- 添加 is_hidden 字段到 tasks 表
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE;

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_tasks_is_hidden ON tasks(is_hidden);
CREATE INDEX IF NOT EXISTS idx_tasks_status_is_hidden ON tasks(status, is_hidden) WHERE is_hidden = false;

-- 更新现有数据（将 NULL 设为 false）
UPDATE tasks SET is_hidden = false WHERE is_hidden IS NULL;

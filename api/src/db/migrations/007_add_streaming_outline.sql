-- Migration: Add streaming outline generation tables
-- Date: 2026-03-23

-- ===== 大纲生成进度表 =====
CREATE TABLE IF NOT EXISTS outline_generation_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'running',
  current_layer VARCHAR(20),  -- insights/angles/macro/meso/micro/data_requirements/completed
  layers JSONB DEFAULT '[]',
  accumulated_outline JSONB DEFAULT '[]',
  insights JSONB DEFAULT '[]',
  novel_angles JSONB DEFAULT '[]',
  layer_progress JSONB DEFAULT '{"macro":0,"meso":0,"micro":0}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(task_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_outline_progress_task ON outline_generation_progress(task_id);
CREATE INDEX IF NOT EXISTS idx_outline_progress_status ON outline_generation_progress(status);

-- ===== 大纲版本表 =====
CREATE TABLE IF NOT EXISTS outline_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  outline JSONB NOT NULL,
  layers JSONB,
  insights JSONB,
  novel_angles JSONB,
  data_requirements JSONB,
  generated_by VARCHAR(50) DEFAULT 'system',
  generation_mode VARCHAR(20) DEFAULT 'streaming',
  layer_progress JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_outline_versions_task ON outline_versions(task_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_outline_versions_created ON outline_versions(created_at);

-- ===== 添加注释 =====
COMMENT ON TABLE outline_generation_progress IS '流式大纲生成进度跟踪';
COMMENT ON TABLE outline_versions IS '大纲版本历史记录';

COMMENT ON COLUMN outline_generation_progress.current_layer IS '当前正在生成的层级';
COMMENT ON COLUMN outline_generation_progress.layers IS '各层生成状态和章节';
COMMENT ON COLUMN outline_generation_progress.layer_progress IS '各层进度百分比';

COMMENT ON COLUMN outline_versions.generation_mode IS '生成模式: streaming/batch';
COMMENT ON COLUMN outline_versions.layer_progress IS '各层完成进度';

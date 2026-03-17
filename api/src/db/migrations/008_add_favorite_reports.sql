-- Migration: 添加热点话题报告收藏表
-- Date: 2026-03-18

-- 创建收藏报告表
CREATE TABLE IF NOT EXISTS favorite_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    report_id VARCHAR(255) NOT NULL,
    topic_id VARCHAR(255) NOT NULL,
    topic_title VARCHAR(500) NOT NULL,
    report_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 唯一约束：每个用户对同一报告只能收藏一次
    CONSTRAINT unique_user_report UNIQUE (user_id, report_id)
);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_favorite_reports_user_id ON favorite_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_reports_report_id ON favorite_reports(report_id);
CREATE INDEX IF NOT EXISTS idx_favorite_reports_topic_id ON favorite_reports(topic_id);
CREATE INDEX IF NOT EXISTS idx_favorite_reports_created_at ON favorite_reports(created_at);

-- 注释
COMMENT ON TABLE favorite_reports IS '热点话题专家解读报告收藏表';
COMMENT ON COLUMN favorite_reports.user_id IS '用户ID';
COMMENT ON COLUMN favorite_reports.report_id IS '报告ID';
COMMENT ON COLUMN favorite_reports.topic_id IS '话题ID';
COMMENT ON COLUMN favorite_reports.topic_title IS '话题标题';
COMMENT ON COLUMN favorite_reports.report_data IS '报告完整数据(JSON格式)';

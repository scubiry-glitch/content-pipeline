-- Migration: 添加信源分级字段
-- Date: 2026-03-16

-- 添加 credibility 字段到 research_annotations 表
ALTER TABLE research_annotations
ADD COLUMN IF NOT EXISTS credibility JSONB;

-- 注释说明
COMMENT ON COLUMN research_annotations.credibility IS '信源可信度评估，包含等级(A/B/C/D)、分数、原因';

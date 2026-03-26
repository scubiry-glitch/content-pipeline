-- Migration: AI 批量处理 - RSS 内容智能分析 v6.1
-- 创建 AI 分析结果表和任务推荐表

-- ============================================
-- 1. RSS AI 分析结果表
-- ============================================
CREATE TABLE IF NOT EXISTS rss_item_ai_analysis (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(32) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  
  -- 质量评分
  quality_score INTEGER,
  quality_dimensions JSONB DEFAULT '{}',
  quality_summary TEXT,
  quality_strengths TEXT[] DEFAULT '{}',
  quality_weaknesses TEXT[] DEFAULT '{}',
  quality_recommendation VARCHAR(20),  -- promote/normal/demote/filter
  
  -- 分类标签
  primary_category VARCHAR(50),
  primary_category_confidence DECIMAL(3,2),
  secondary_categories JSONB DEFAULT '[]',
  extracted_tags JSONB DEFAULT '[]',
  extracted_entities JSONB DEFAULT '[]',
  expert_library_match JSONB DEFAULT '{}',
  
  -- 情感分析
  sentiment VARCHAR(20),
  sentiment_score INTEGER,  -- -100 to +100
  sentiment_dimensions JSONB DEFAULT '{}',
  key_opinions JSONB DEFAULT '[]',
  key_elements JSONB DEFAULT '{}',  -- opportunities/risks/uncertainties/catalysts
  sentiment_intensity VARCHAR(20),
  sentiment_stance VARCHAR(20),
  
  -- 任务推荐
  task_recommendations JSONB DEFAULT '[]',
  
  -- 元数据
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  model_version VARCHAR(20) DEFAULT 'v1.0',
  processing_time_ms INTEGER,
  
  CONSTRAINT unique_rss_ai_analysis UNIQUE (rss_item_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ria_quality ON rss_item_ai_analysis(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_ria_category ON rss_item_ai_analysis(primary_category);
CREATE INDEX IF NOT EXISTS idx_ria_sentiment ON rss_item_ai_analysis(sentiment);
CREATE INDEX IF NOT EXISTS idx_ria_analyzed_at ON rss_item_ai_analysis(analyzed_at);

-- 复合索引：分类+质量分，用于筛选高质量特定领域内容
CREATE INDEX IF NOT EXISTS idx_ria_category_quality ON rss_item_ai_analysis(primary_category, quality_score DESC);

-- 复合索引：情感+质量分，用于筛选高质量积极内容
CREATE INDEX IF NOT EXISTS idx_ria_sentiment_quality ON rss_item_ai_analysis(sentiment, quality_score DESC);

-- ============================================
-- 2. 扩展 rss_items 表
-- ============================================
ALTER TABLE rss_items 
  ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER,
  ADD COLUMN IF NOT EXISTS ai_category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS ai_sentiment VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ai_task_recommended BOOLEAN DEFAULT FALSE;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_rss_ai_quality ON rss_items(ai_quality_score) WHERE ai_quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rss_ai_category ON rss_items(ai_category) WHERE ai_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rss_ai_analyzed ON rss_items(ai_analyzed_at) WHERE ai_analyzed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rss_ai_task_rec ON rss_items(ai_task_recommended) WHERE ai_task_recommended = FALSE;

-- 复合索引：未分析的高热度内容（优先处理）
CREATE INDEX IF NOT EXISTS idx_rss_unprocessed_hot ON rss_items(ai_analyzed_at, hot_score DESC) 
  WHERE ai_analyzed_at IS NULL AND hot_score > 0;

-- ============================================
-- 3. AI 任务推荐表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_task_recommendations (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(32) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  recommendation_data JSONB NOT NULL,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/accepted/rejected/implemented
  
  -- 用户反馈
  accepted_by VARCHAR(50),
  accepted_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  
  -- 关联的任务
  created_task_id VARCHAR(50),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_rss_recommendation UNIQUE (rss_item_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_atr_status ON ai_task_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_atr_created ON ai_task_recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atr_accepted ON ai_task_recommendations(accepted_at) WHERE accepted_at IS NOT NULL;

-- ============================================
-- 4. 创建更新时间触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_ai_task_recommendations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_atr_timestamp ON ai_task_recommendations;
CREATE TRIGGER trigger_update_atr_timestamp
  BEFORE UPDATE ON ai_task_recommendations
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_task_recommendations_timestamp();

-- ============================================
-- 5. 创建视图方便查询
-- ============================================

-- AI 分析完整视图
CREATE OR REPLACE VIEW v_rss_ai_analysis_complete AS
SELECT 
  r.id as rss_item_id,
  r.title,
  r.source_name,
  r.hot_score,
  r.trend,
  r.published_at,
  a.*
FROM rss_items r
LEFT JOIN rss_item_ai_analysis a ON r.id = a.rss_item_id
WHERE a.id IS NOT NULL;

-- 高质量内容视图 (quality_score >= 70)
CREATE OR REPLACE VIEW v_rss_high_quality AS
SELECT 
  r.id as rss_item_id,
  r.title,
  r.source_name,
  r.hot_score,
  a.quality_score,
  a.primary_category,
  a.sentiment,
  a.analyzed_at
FROM rss_items r
JOIN rss_item_ai_analysis a ON r.id = a.rss_item_id
WHERE a.quality_score >= 70;

-- 待处理任务推荐视图
CREATE OR REPLACE VIEW v_pending_task_recommendations AS
SELECT 
  tr.*,
  r.title as rss_title,
  r.source_name,
  r.hot_score,
  a.quality_score,
  a.primary_category,
  a.sentiment_score
FROM ai_task_recommendations tr
JOIN rss_items r ON tr.rss_item_id = r.id
JOIN rss_item_ai_analysis a ON r.id = a.rss_item_id
WHERE tr.status = 'pending'
ORDER BY a.quality_score DESC, r.hot_score DESC;

-- ============================================
-- 6. 添加注释
-- ============================================
COMMENT ON TABLE rss_item_ai_analysis IS 'RSS 内容的 AI 批量分析结果';
COMMENT ON COLUMN rss_item_ai_analysis.quality_score IS '综合质量评分 0-100';
COMMENT ON COLUMN rss_item_ai_analysis.quality_recommendation IS '处理建议: promote/normal/demote/filter';
COMMENT ON COLUMN rss_item_ai_analysis.primary_category IS '主领域分类，对标 expert-library';
COMMENT ON COLUMN rss_item_ai_analysis.sentiment_score IS '情感分数 -100 到 +100';
COMMENT ON COLUMN rss_item_ai_analysis.task_recommendations IS 'AI 生成的任务推荐';

COMMENT ON TABLE ai_task_recommendations IS 'AI 任务推荐管理表';
COMMENT ON COLUMN ai_task_recommendations.status IS '推荐状态: pending/accepted/rejected/implemented';

-- ============================================
-- 7. 初始化数据迁移（如需要）
-- ============================================
-- 此迁移不处理现有数据，仅创建表结构
-- 现有数据的 AI 分析将通过批量处理任务完成

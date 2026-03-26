-- ============================================
-- v6.2 Assets AI 批量处理 - 数据库 Schema
-- ============================================

-- ============================================
-- 1. Asset AI 分析结果表 (新表)
-- ============================================
CREATE TABLE IF NOT EXISTS asset_ai_analysis (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  
  -- 质量评分
  quality_score INTEGER,
  quality_dimensions JSONB DEFAULT '{}',
  quality_summary TEXT,
  quality_strengths TEXT[] DEFAULT '{}',
  quality_weaknesses TEXT[] DEFAULT '{}',
  quality_key_insights TEXT[] DEFAULT '{}',
  quality_data_highlights TEXT[] DEFAULT '{}',
  quality_recommendation VARCHAR(20),  -- highly_recommended/recommended/normal/archive
  
  -- 结构分析
  structure_analysis JSONB DEFAULT '{}',
  
  -- 主题分类
  primary_theme_id VARCHAR(50),
  primary_theme_confidence DECIMAL(3,2),
  secondary_themes JSONB DEFAULT '[]',
  expert_library_mapping JSONB DEFAULT '[]',
  
  -- 标签和实体
  extracted_tags JSONB DEFAULT '[]',
  extracted_entities JSONB DEFAULT '[]',
  
  -- 向量化状态
  embedding_status VARCHAR(20) DEFAULT 'pending',  -- pending/processing/completed/failed
  document_embedding vector(768),
  chunk_count INTEGER DEFAULT 0,
  embedding_model VARCHAR(50),
  
  -- 去重结果
  duplicate_detection_result JSONB DEFAULT '{}',
  similarity_group_id VARCHAR(50),
  
  -- 任务推荐
  has_recommendation BOOLEAN DEFAULT FALSE,
  
  -- 元数据
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  model_version VARCHAR(20) DEFAULT 'v1.0',
  processing_time_ms INTEGER,
  
  CONSTRAINT unique_asset_ai_analysis UNIQUE (asset_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_aaa_quality ON asset_ai_analysis(quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aaa_theme ON asset_ai_analysis(primary_theme_id) WHERE primary_theme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aaa_embedding_status ON asset_ai_analysis(embedding_status);
CREATE INDEX IF NOT EXISTS idx_aaa_analyzed_at ON asset_ai_analysis(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_aaa_similarity_group ON asset_ai_analysis(similarity_group_id) WHERE similarity_group_id IS NOT NULL;

-- ============================================
-- 2. 扩展 assets 表
-- ============================================
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_theme_id VARCHAR(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_theme_confidence DECIMAL(3,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_processing_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_duplicate_of VARCHAR(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_document_embedding vector(768);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_embedding_model VARCHAR(50);

-- 索引
CREATE INDEX IF NOT EXISTS idx_assets_ai_quality ON assets(ai_quality_score) WHERE ai_quality_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_ai_theme ON assets(ai_theme_id) WHERE ai_theme_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_ai_status ON assets(ai_processing_status);

-- ============================================
-- 3. 扩展 ai_task_recommendations 表（复用 v6.1）
-- ============================================
-- 添加 source_type 字段
ALTER TABLE ai_task_recommendations ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) DEFAULT 'rss';

-- 添加 source_asset_id 字段
ALTER TABLE ai_task_recommendations ADD COLUMN IF NOT EXISTS source_asset_id VARCHAR(50) REFERENCES assets(id);

-- 移除旧唯一约束（如果存在）
ALTER TABLE ai_task_recommendations DROP CONSTRAINT IF EXISTS unique_rss_recommendation;

-- 删除旧索引
DROP INDEX IF EXISTS idx_atr_unique_rss;
DROP INDEX IF EXISTS idx_atr_unique_asset;

-- 创建条件唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_atr_unique_rss ON ai_task_recommendations(rss_item_id) WHERE source_type = 'rss';
CREATE UNIQUE INDEX IF NOT EXISTS idx_atr_unique_asset ON ai_task_recommendations(source_asset_id) WHERE source_type = 'asset';

CREATE INDEX IF NOT EXISTS idx_atr_source_type ON ai_task_recommendations(source_type);

-- ============================================
-- 4. Asset 内容分块表（用于向量化）
-- ============================================
CREATE TABLE IF NOT EXISTS asset_content_chunks (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_type VARCHAR(20) NOT NULL,  -- abstract/toc/body/conclusion/chart
  chapter_title VARCHAR(255),
  start_page INTEGER,
  end_page INTEGER,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(asset_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_acc_asset ON asset_content_chunks(asset_id);
CREATE INDEX IF NOT EXISTS idx_acc_type ON asset_content_chunks(chunk_type);

-- ============================================
-- 5. Asset 分块向量表（pgvector）
-- ============================================
CREATE TABLE IF NOT EXISTS asset_embeddings (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_embedding vector(1536) NOT NULL,
  chunk_type VARCHAR(20) NOT NULL,
  chapter_title VARCHAR(255),
  start_page INTEGER,
  end_page INTEGER,
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(asset_id, chunk_index)
);

-- HNSW 向量索引（高效相似度搜索）
CREATE INDEX IF NOT EXISTS idx_ae_vector ON asset_embeddings USING hnsw (chunk_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_ae_asset ON asset_embeddings(asset_id);
CREATE INDEX IF NOT EXISTS idx_ae_type ON asset_embeddings(chunk_type);

-- ============================================
-- 6. 相似内容分组表
-- ============================================
CREATE TABLE IF NOT EXISTS asset_similarity_groups (
  id VARCHAR(50) PRIMARY KEY,
  root_asset_id VARCHAR(50) NOT NULL,  -- 原始文件
  asset_ids TEXT[] NOT NULL,            -- 所有相似文件
  similarity_matrix JSONB,              -- 相似度矩阵
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asg_root ON asset_similarity_groups(root_asset_id);

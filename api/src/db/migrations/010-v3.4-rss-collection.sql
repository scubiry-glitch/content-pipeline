-- Migration: RSS Collection Tables
-- 创建 RSS 采集相关的表结构

-- 1. RSS 条目表
CREATE TABLE IF NOT EXISTS rss_items (
  id VARCHAR(50) PRIMARY KEY,
  source_id VARCHAR(50) NOT NULL,
  source_name VARCHAR(200) NOT NULL,
  title VARCHAR(500) NOT NULL,
  link VARCHAR(1000) NOT NULL,
  content TEXT,
  summary TEXT,
  published_at TIMESTAMP NOT NULL,
  author VARCHAR(200),
  categories JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  relevance_score DECIMAL(3, 2) DEFAULT 0,
  hot_score INTEGER DEFAULT 0,
  trend VARCHAR(20) DEFAULT 'stable',
  sentiment VARCHAR(20) DEFAULT 'neutral',
  embedding VECTOR(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. RSS 采集日志表
CREATE TABLE IF NOT EXISTS rss_fetch_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id VARCHAR(50) NOT NULL,
  fetched_at TIMESTAMP DEFAULT NOW(),
  fetched_date DATE DEFAULT CURRENT_DATE,
  status VARCHAR(50) DEFAULT 'success',
  items_fetched INTEGER DEFAULT 0,
  items_imported INTEGER DEFAULT 0,
  error_message TEXT,
  UNIQUE(source_id, fetched_date)
);

-- 3. 热点话题表（如果不存在）
CREATE TABLE IF NOT EXISTS hot_topics (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  source VARCHAR(200) NOT NULL,
  source_url VARCHAR(1000),
  hot_score INTEGER DEFAULT 0,
  trend VARCHAR(20) DEFAULT 'stable',
  sentiment VARCHAR(20) DEFAULT 'neutral',
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_rss_items_source_id ON rss_items(source_id);
CREATE INDEX IF NOT EXISTS idx_rss_items_published_at ON rss_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_relevance ON rss_items(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_hot_score ON rss_items(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_created_at ON rss_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rss_items_link ON rss_items(link);
CREATE INDEX IF NOT EXISTS idx_rss_items_tags ON rss_items USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_rss_fetch_logs_source_id ON rss_fetch_logs(source_id);
CREATE INDEX IF NOT EXISTS idx_rss_fetch_logs_fetched_at ON rss_fetch_logs(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_hot_topics_hot_score ON hot_topics(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_hot_topics_trend ON hot_topics(trend);
CREATE INDEX IF NOT EXISTS idx_hot_topics_published ON hot_topics(published_at DESC);

-- 5. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_rss_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_rss_items ON rss_items;
CREATE TRIGGER trigger_update_rss_items
    BEFORE UPDATE ON rss_items
    FOR EACH ROW
    EXECUTE FUNCTION update_rss_items_updated_at();

CREATE OR REPLACE FUNCTION update_hot_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hot_topics ON hot_topics;
CREATE TRIGGER trigger_update_hot_topics
    BEFORE UPDATE ON hot_topics
    FOR EACH ROW
    EXECUTE FUNCTION update_hot_topics_updated_at();

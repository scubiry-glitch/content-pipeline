-- Migration: Add community topics and topic unification tables
-- Date: 2026-03-23

-- ===== 社区话题表 =====
CREATE TABLE IF NOT EXISTS community_topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  platform_id VARCHAR(100),
  platform_url VARCHAR(1000),
  
  -- 热度指标
  hot_score INTEGER DEFAULT 0,
  platform_rank INTEGER,
  
  -- 互动数据
  view_count BIGINT,
  like_count BIGINT,
  comment_count BIGINT,
  share_count BIGINT,
  
  -- 内容特征
  content_type VARCHAR(20) DEFAULT 'text',
  key_opinions JSONB DEFAULT '[]',
  sentiment VARCHAR(20) DEFAULT 'neutral',
  tags JSONB DEFAULT '[]',
  
  -- 创作者信息
  creator_name VARCHAR(200),
  creator_followers BIGINT,
  creator_verified BOOLEAN DEFAULT false,
  
  -- 分类与过滤
  category VARCHAR(50),
  is_filtered BOOLEAN DEFAULT false,
  filter_reason VARCHAR(200),
  
  published_at TIMESTAMP,
  crawled_at TIMESTAMP DEFAULT NOW(),
  
  -- 关联
  unified_topic_id VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_community_platform ON community_topics(platform);
CREATE INDEX IF NOT EXISTS idx_community_hot_score ON community_topics(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_community_published ON community_topics(published_at);
CREATE INDEX IF NOT EXISTS idx_community_crawled ON community_topics(crawled_at);
CREATE INDEX IF NOT EXISTS idx_community_unified ON community_topics(unified_topic_id);
CREATE INDEX IF NOT EXISTS idx_community_category ON community_topics(category);
CREATE INDEX IF NOT EXISTS idx_community_filtered ON community_topics(is_filtered);

-- ===== Web 搜索结果表 =====
CREATE TABLE IF NOT EXISTS web_search_results (
  id VARCHAR(50) PRIMARY KEY,
  query VARCHAR(500),
  search_mode VARCHAR(50),      -- trending/verify/gap_fill/competitor
  search_engine VARCHAR(50),
  
  -- 结果内容
  title VARCHAR(500),
  url VARCHAR(1000),
  snippet TEXT,
  content TEXT,
  
  -- 元数据
  published_at TIMESTAMP,
  source_domain VARCHAR(200),
  is_authority_source BOOLEAN DEFAULT false,
  
  -- 关联
  related_topic_id VARCHAR(50),
  
  -- 质量指标
  relevance_score DECIMAL(3,2),
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_web_search_topic ON web_search_results(related_topic_id);
CREATE INDEX IF NOT EXISTS idx_web_search_query ON web_search_results(query);
CREATE INDEX IF NOT EXISTS idx_web_search_date ON web_search_results(published_at);
CREATE INDEX IF NOT EXISTS idx_web_search_created ON web_search_results(created_at);

-- ===== 归并话题表 =====
CREATE TABLE IF NOT EXISTS unified_topics (
  id VARCHAR(50) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  canonical_title VARCHAR(500),
  
  -- 聚合热度
  hot_score INTEGER DEFAULT 0,
  confidence DECIMAL(3,2) DEFAULT 0,
  
  -- 来源分布
  has_rss_source BOOLEAN DEFAULT false,
  has_web_source BOOLEAN DEFAULT false,
  has_community_source BOOLEAN DEFAULT false,
  source_count INTEGER DEFAULT 0,
  
  -- 来源详情
  sources JSONB DEFAULT '[]',                -- [{type, platform, url, hotScore}]
  
  -- 内容聚合
  key_opinions JSONB DEFAULT '[]',
  cross_platform_sentiment VARCHAR(20) DEFAULT 'neutral',
  
  -- 时间
  first_seen_at TIMESTAMP,
  last_updated_at TIMESTAMP,
  
  -- 状态
  status VARCHAR(20) DEFAULT 'pending',  -- pending/processing/completed
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_unified_hot_score ON unified_topics(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_unified_confidence ON unified_topics(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_unified_status ON unified_topics(status);
CREATE INDEX IF NOT EXISTS idx_unified_sources ON unified_topics(has_rss_source, has_web_source, has_community_source);
CREATE INDEX IF NOT EXISTS idx_unified_first_seen ON unified_topics(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_unified_updated ON unified_topics(updated_at);

-- ===== 更新现有表 =====

-- 为 rss_items 添加 unified_topic_id
ALTER TABLE rss_items 
ADD COLUMN IF NOT EXISTS unified_topic_id VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_rss_unified ON rss_items(unified_topic_id);

-- 为 hot_topics 添加 discovery_sources 字段
ALTER TABLE hot_topics 
ADD COLUMN IF NOT EXISTS discovery_sources JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS unified_topic_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS web_verified_score INTEGER,
ADD COLUMN IF NOT EXISTS community_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_hot_topics_unified ON hot_topics(unified_topic_id);
CREATE INDEX IF NOT EXISTS idx_hot_topics_discovery ON hot_topics USING GIN (discovery_sources);

-- ===== 创建视图 =====

-- 跨平台热点视图
CREATE OR REPLACE VIEW cross_platform_hot_topics AS
SELECT 
  u.*,
  (SELECT COUNT(*) FROM rss_items r WHERE r.unified_topic_id = u.id) as rss_count,
  (SELECT COUNT(*) FROM web_search_results w WHERE w.related_topic_id = u.id) as web_count,
  (SELECT COUNT(*) FROM community_topics c WHERE c.unified_topic_id = u.id) as community_count
FROM unified_topics u
WHERE u.source_count >= 2
ORDER BY u.hot_score DESC;

-- ===== 添加注释 =====

COMMENT ON TABLE community_topics IS '社区平台抓取的热门话题';
COMMENT ON TABLE web_search_results IS 'Web Search 搜索结果';
COMMENT ON TABLE unified_topics IS '多源归并后的统一话题';

COMMENT ON COLUMN community_topics.platform IS '平台名称: xiaohongshu/weibo/zhihu/bilibili/xueqiu';
COMMENT ON COLUMN community_topics.key_opinions IS '从社区内容中提取的关键观点';
COMMENT ON COLUMN community_topics.is_filtered IS '是否被过滤（低质量/不相关）';

COMMENT ON COLUMN unified_topics.canonical_title IS '标准化标题（去重后的统一标题）';
COMMENT ON COLUMN unified_topics.confidence IS '可信度分数 (0-1)，基于来源数量计算';
COMMENT ON COLUMN unified_topics.sources IS '所有来源的详细信息';

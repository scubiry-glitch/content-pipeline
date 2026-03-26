-- 优化热度算法：添加关键词统计表和改进热度计算

-- 关键词统计表
CREATE TABLE IF NOT EXISTS keyword_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword VARCHAR(100) NOT NULL UNIQUE,
  count INTEGER DEFAULT 1,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 关键词与内容关联表
CREATE TABLE IF NOT EXISTS content_keyword_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type VARCHAR(50) NOT NULL, -- 'rss_item', 'hot_topic'
  content_id VARCHAR(255) NOT NULL,
  keyword VARCHAR(100) NOT NULL,
  weight DECIMAL(3,2) DEFAULT 1.0, -- 关键词权重
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(content_type, content_id, keyword)
);

-- 来源权威性配置表
CREATE TABLE IF NOT EXISTS source_authority (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(100) NOT NULL UNIQUE,
  authority_score DECIMAL(3,2) DEFAULT 0.5, -- 0-1 权威性分数
  reliability_score DECIMAL(3,2) DEFAULT 0.5, -- 0-1 可信度分数
  category VARCHAR(50), -- 分类
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入一些默认的来源权威性数据
INSERT INTO source_authority (source_name, authority_score, reliability_score, category) VALUES
  ('Nature News', 0.95, 0.95, 'science'),
  ('MIT Technology Review', 0.90, 0.90, 'tech'),
  ('Ars Technica', 0.85, 0.85, 'tech'),
  ('The Verge', 0.80, 0.80, 'tech'),
  ('TechCrunch', 0.75, 0.75, 'startup'),
  ('36氪', 0.75, 0.75, 'tech'),
  ('机器之心', 0.80, 0.80, 'AI'),
  ('InfoQ中文', 0.75, 0.80, 'tech'),
  ('Hacker News', 0.70, 0.75, 'tech'),
  ('财新', 0.90, 0.90, 'finance'),
  ('第一财经', 0.85, 0.85, 'finance'),
  ('Slashdot', 0.70, 0.75, 'tech'),
  ('GitHub Blog', 0.85, 0.90, 'dev')
ON CONFLICT (source_name) DO NOTHING;

-- 为 keyword_stats 创建索引
CREATE INDEX IF NOT EXISTS idx_keyword_stats_count ON keyword_stats(count DESC);
CREATE INDEX IF NOT EXISTS idx_keyword_stats_last_seen ON keyword_stats(last_seen_at);

-- 为 content_keyword_relations 创建索引
CREATE INDEX IF NOT EXISTS idx_ckr_content ON content_keyword_relations(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_ckr_keyword ON content_keyword_relations(keyword);

-- 添加注释
COMMENT ON TABLE keyword_stats IS '关键词统计表，记录关键词出现频率';
COMMENT ON TABLE content_keyword_relations IS '内容与关键词关联表';
COMMENT ON TABLE source_authority IS '来源权威性配置表';

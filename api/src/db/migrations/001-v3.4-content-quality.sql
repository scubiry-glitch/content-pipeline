-- v3.4 内容质量输入体系数据库迁移
-- 日期: 2026-03-17

-- 1. 研报表 (扩展已有reports表)
DO $$
BEGIN
    -- 检查并添加新列
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'quality_score_overall') THEN
        ALTER TABLE reports ADD COLUMN quality_score_overall INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'quality_score_authority') THEN
        ALTER TABLE reports ADD COLUMN quality_score_authority INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'quality_score_completeness') THEN
        ALTER TABLE reports ADD COLUMN quality_score_completeness INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'quality_score_logic') THEN
        ALTER TABLE reports ADD COLUMN quality_score_logic INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'quality_score_freshness') THEN
        ALTER TABLE reports ADD COLUMN quality_score_freshness INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'quality_score_citations') THEN
        ALTER TABLE reports ADD COLUMN quality_score_citations INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'key_points') THEN
        ALTER TABLE reports ADD COLUMN key_points JSONB DEFAULT '[]';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'sections') THEN
        ALTER TABLE reports ADD COLUMN sections JSONB DEFAULT '[]';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'parsed_content') THEN
        ALTER TABLE reports ADD COLUMN parsed_content TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'usage_count') THEN
        ALTER TABLE reports ADD COLUMN usage_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- 2. 热点表
CREATE TABLE IF NOT EXISTS hot_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  source VARCHAR(200),
  source_url TEXT,
  hot_score INTEGER DEFAULT 0,
  trend VARCHAR(20) DEFAULT 'stable', -- up, stable, down
  sentiment VARCHAR(20) DEFAULT 'neutral', -- positive, neutral, negative
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 研报-热点关联表
CREATE TABLE IF NOT EXISTS report_hot_topic_relations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
  hot_topic_id UUID REFERENCES hot_topics(id) ON DELETE CASCADE,
  match_score INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(report_id, hot_topic_id)
);

-- 4. 素材表
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL, -- chart, quote, data, insight
  title VARCHAR(500),
  content TEXT NOT NULL,
  source VARCHAR(200),
  source_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  tags JSONB DEFAULT '[]',
  quality_score INTEGER,
  usage_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. 用户关注热点表
CREATE TABLE IF NOT EXISTS user_hot_topic_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  hot_topic_id UUID REFERENCES hot_topics(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, hot_topic_id)
);

-- 6. RSS源配置表
CREATE TABLE IF NOT EXISTS rss_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  url VARCHAR(500) NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  last_crawled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. 创建索引
-- 研报搜索优化
CREATE INDEX IF NOT EXISTS idx_reports_tags ON reports USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_reports_institution ON reports (institution);
CREATE INDEX IF NOT EXISTS idx_reports_quality_score ON reports (quality_score_overall DESC);
CREATE INDEX IF NOT EXISTS idx_reports_usage ON reports (usage_count DESC);

-- 热点查询优化
CREATE INDEX IF NOT EXISTS idx_hot_topics_hot_score ON hot_topics (hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_hot_topics_trend ON hot_topics (trend);
CREATE INDEX IF NOT EXISTS idx_hot_topics_published ON hot_topics (published_at DESC);

-- 素材查询优化
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (type);
CREATE INDEX IF NOT EXISTS idx_assets_source ON assets (source_id);
CREATE INDEX IF NOT EXISTS idx_assets_tags ON assets USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_assets_usage ON assets (usage_count DESC);

-- 关联查询优化
CREATE INDEX IF NOT EXISTS idx_report_hot_topic_report ON report_hot_topic_relations (report_id);
CREATE INDEX IF NOT EXISTS idx_report_hot_topic_hot ON report_hot_topic_relations (hot_topic_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_user ON user_hot_topic_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_hot ON user_hot_topic_follows (hot_topic_id);

-- 8. 插入默认RSS源
INSERT INTO rss_sources (name, url, category) VALUES
  ('36氪', 'https://36kr.com/feed', '科技'),
  ('虎嗅', 'https://www.huxiu.com/rss', '商业'),
  ('界面新闻', 'https://www.jiemian.com/rss', '财经'),
  ('财新', 'https://www.caixin.com/rss', '财经'),
  ('雪球', 'https://xueqiu.com/rss', '投资')
ON CONFLICT DO NOTHING;

-- 9. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 10. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v3.4-content-quality', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

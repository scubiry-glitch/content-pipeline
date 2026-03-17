-- v4.3 内容表现预测数据库迁移
-- 日期: 2026-03-17

-- 1. 内容预测表
CREATE TABLE IF NOT EXISTS content_predictions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL,
  content_features JSONB NOT NULL DEFAULT '{}',

  -- 预测结果
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  confidence DECIMAL(5,2) CHECK (confidence >= 0 AND confidence <= 100),

  -- 传播预测
  predicted_views INTEGER,
  predicted_engagement INTEGER,
  predicted_shares INTEGER,
  predicted_saves INTEGER,
  predicted_views_range JSONB, -- { min: 10000, max: 15000 }

  -- 时间建议
  recommended_times JSONB NOT NULL DEFAULT '[]',

  -- 平台适配
  platform_scores JSONB NOT NULL DEFAULT '{}',

  -- 风险预警
  risk_level VARCHAR(20) DEFAULT 'low', -- low, medium, high
  risk_warnings JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 预测模型配置表
CREATE TABLE IF NOT EXISTS prediction_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  model_type VARCHAR(50) NOT NULL, -- content_score, view_prediction, engagement, platform_fit
  version VARCHAR(20) NOT NULL,
  weights JSONB NOT NULL DEFAULT '{}',
  accuracy DECIMAL(5,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 受众洞察表
CREATE TABLE IF NOT EXISTS audience_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES drafts(id) ON DELETE CASCADE,

  -- 受众画像匹配
  demographic_match DECIMAL(5,2), -- 人口统计学匹配度
  interest_match DECIMAL(5,2), -- 兴趣匹配度
  behavior_match DECIMAL(5,2), -- 行为匹配度

  -- 活跃时段
  peak_hours JSONB NOT NULL DEFAULT '[]', -- [{ hour: 20, score: 85 }, ...]
  peak_days JSONB NOT NULL DEFAULT '[]', -- [{ day: 'monday', score: 75 }, ...]

  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 历史表现数据表
CREATE TABLE IF NOT EXISTS content_performance_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type VARCHAR(50) NOT NULL,
  topic_category VARCHAR(100),

  -- 实际表现
  actual_views INTEGER,
  actual_engagement INTEGER,
  actual_shares INTEGER,
  actual_saves INTEGER,

  -- 发布信息
  publish_time TIMESTAMP,
  platform VARCHAR(50),

  -- 内容特征
  content_features JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

-- 5. 预约发布表
CREATE TABLE IF NOT EXISTS scheduled_publishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  draft_id UUID REFERENCES drafts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  scheduled_time TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending, published, cancelled, failed
  prediction_id UUID REFERENCES content_predictions(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. 创建索引
CREATE INDEX IF NOT EXISTS idx_predictions_draft ON content_predictions (draft_id);
CREATE INDEX IF NOT EXISTS idx_predictions_score ON content_predictions (overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_models_type ON prediction_models (model_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_audience_content ON audience_insights (content_id);
CREATE INDEX IF NOT EXISTS idx_performance_type ON content_performance_history (content_type, topic_category);
CREATE INDEX IF NOT EXISTS idx_scheduled_time ON scheduled_publishes (scheduled_time) WHERE status = 'pending';

-- 7. 插入默认预测模型配置
INSERT INTO prediction_models (name, model_type, version, weights) VALUES
  ('内容质量评分模型 v1', 'content_score', '1.0', '{
    "title_attractiveness": 0.20,
    "content_depth": 0.20,
    "hot_topic_relevance": 0.15,
    "freshness": 0.15,
    "originality": 0.15,
    "professionalism": 0.15
  }'),
  ('阅读量预测模型 v1', 'view_prediction', '1.0', '{
    "content_score": 0.30,
    "hot_topic_boost": 0.25,
    "time_factor": 0.20,
    "platform_factor": 0.15,
    "historical_factor": 0.10
  }'),
  ('互动率预测模型 v1', 'engagement', '1.0', '{
    "content_quality": 0.35,
    "topic_interest": 0.25,
    "controversy_score": 0.20,
    "audience_match": 0.20
  }')
ON CONFLICT DO NOTHING;

-- 8. 更新时间触发器
DROP TRIGGER IF EXISTS update_predictions_updated_at ON content_predictions;
CREATE TRIGGER update_predictions_updated_at
    BEFORE UPDATE ON content_predictions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_prediction_models_updated_at ON prediction_models;
CREATE TRIGGER update_prediction_models_updated_at
    BEFORE UPDATE ON prediction_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_scheduled_publishes_updated_at ON scheduled_publishes;
CREATE TRIGGER update_scheduled_publishes_updated_at
    BEFORE UPDATE ON scheduled_publishes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 9. 迁移完成标记
INSERT INTO migrations (version, applied_at) VALUES ('v4.3-prediction', NOW())
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

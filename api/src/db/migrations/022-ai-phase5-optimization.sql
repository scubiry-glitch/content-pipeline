-- Migration: AI 批量处理 Phase 5 - 优化与监控
-- 缓存表、监控表、反馈表

-- ============================================
-- 1. Embedding 缓存表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_embedding_cache (
  cache_key VARCHAR(32) PRIMARY KEY,
  text_preview VARCHAR(500),
  embedding JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_cache_created 
  ON ai_embedding_cache(created_at);

-- ============================================
-- 2. Response 缓存表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_response_cache (
  cache_key VARCHAR(32),
  model VARCHAR(50),
  prompt_preview VARCHAR(500),
  response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (cache_key, model)
);

CREATE INDEX IF NOT EXISTS idx_response_cache_created 
  ON ai_response_cache(created_at);

CREATE INDEX IF NOT EXISTS idx_response_cache_model 
  ON ai_response_cache(model, created_at);

-- ============================================
-- 3. 处理日志表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_processing_logs (
  id SERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL,
  component VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_created ON ai_processing_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_component ON ai_processing_logs(component);
CREATE INDEX IF NOT EXISTS idx_ai_logs_level ON ai_processing_logs(level);

-- ============================================
-- 4. 处理指标表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_processing_metrics (
  id SERIAL PRIMARY KEY,
  item_id VARCHAR(50),
  processing_time_ms INTEGER NOT NULL,
  model VARCHAR(50) NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_type VARCHAR(100),
  quality_score INTEGER,
  category VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_metrics_created ON ai_processing_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_item ON ai_processing_metrics(item_id);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_success ON ai_processing_metrics(success);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_category ON ai_processing_metrics(category);

-- ============================================
-- 5. 告警记录表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_alerts (
  id SERIAL PRIMARY KEY,
  rule_id VARCHAR(100) NOT NULL,
  rule_name VARCHAR(200) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  metrics JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_alerts_created ON ai_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_rule ON ai_alerts(rule_id);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_severity ON ai_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_ai_alerts_acknowledged ON ai_alerts(acknowledged);

-- ============================================
-- 6. 用户反馈表
-- ============================================
CREATE TABLE IF NOT EXISTS ai_feedback (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(50) NOT NULL REFERENCES rss_items(id) ON DELETE CASCADE,
  feedback_type VARCHAR(50) NOT NULL,
  ai_result JSONB NOT NULL,
  user_feedback JSONB NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  user_role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_created ON ai_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_item ON ai_feedback(rss_item_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_type ON ai_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user ON ai_feedback(user_id);

-- ============================================
-- 7. 错误案例库
-- ============================================
CREATE TABLE IF NOT EXISTS ai_error_cases (
  id SERIAL PRIMARY KEY,
  rss_item_id VARCHAR(50) NOT NULL,
  feedback_id INTEGER REFERENCES ai_feedback(id),
  feedback_type VARCHAR(50) NOT NULL,
  content_preview TEXT,
  ai_result JSONB NOT NULL,
  corrected_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_error_cases_type ON ai_error_cases(feedback_type);
CREATE INDEX IF NOT EXISTS idx_ai_error_cases_created ON ai_error_cases(created_at DESC);

-- ============================================
-- 8. Prompt 版本历史
-- ============================================
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
  id SERIAL PRIMARY KEY,
  prompt_type VARCHAR(50) NOT NULL,
  version INTEGER NOT NULL,
  prompt_content TEXT NOT NULL,
  accuracy_rate DECIMAL(5,2),
  feedback_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT FALSE,
  created_by VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(prompt_type, version)
);

CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_type ON ai_prompt_versions(prompt_type);
CREATE INDEX IF NOT EXISTS idx_ai_prompt_versions_active ON ai_prompt_versions(is_active);

-- ============================================
-- 9. 添加注释
-- ============================================
COMMENT ON TABLE ai_embedding_cache IS 'Embedding向量缓存，用于加速相似度计算';
COMMENT ON TABLE ai_response_cache IS 'LLM响应缓存，避免重复调用';
COMMENT ON TABLE ai_processing_logs IS 'AI处理日志记录';
COMMENT ON TABLE ai_processing_metrics IS 'AI处理性能指标';
COMMENT ON TABLE ai_alerts IS 'AI处理告警记录';
COMMENT ON TABLE ai_feedback IS '用户对AI结果的反馈';
COMMENT ON TABLE ai_error_cases IS 'AI错误案例库，用于模型改进';
COMMENT ON TABLE ai_prompt_versions IS 'Prompt版本历史，支持A/B测试';

-- ============================================
-- 10. 清理旧数据的定时任务函数
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_ai_cache()
RETURNS void AS $$
BEGIN
  -- 清理24小时前的embedding缓存
  DELETE FROM ai_embedding_cache WHERE created_at < NOW() - INTERVAL '24 hours';
  
  -- 清理1小时前的response缓存
  DELETE FROM ai_response_cache WHERE created_at < NOW() - INTERVAL '1 hour';
  
  -- 清理30天前的日志
  DELETE FROM ai_processing_logs WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- 清理90天前的指标
  DELETE FROM ai_processing_metrics WHERE created_at < NOW() - INTERVAL '90 days';
  
  -- 清理已确认的7天前的告警
  DELETE FROM ai_alerts 
  WHERE acknowledged = true AND created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- v7.4 Deep Analysis — 15 deliverable + Expert Library 结果表
-- 由 batch-ops "深度分析" 开关触发时写入，独立于原 asset_ai_analysis
-- ============================================

CREATE TABLE IF NOT EXISTS asset_deep_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(50) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

  -- 匹配到的专家
  matched_domain_expert_ids JSONB DEFAULT '[]',
  matched_senior_expert_id VARCHAR(50),
  match_reasons JSONB DEFAULT '[]',

  -- 15 个 deliverable，每个一列 JSONB
  topic_recommendations JSONB,    -- ①
  trend_signals JSONB,            -- ②
  differentiation_gaps JSONB,     -- ③
  knowledge_blanks JSONB,         -- ④
  key_facts JSONB,                -- ⑤
  entity_graph JSONB,             -- ⑥
  delta_report JSONB,             -- ⑦
  stale_facts JSONB,              -- ⑧
  knowledge_card JSONB,           -- ⑨
  insights JSONB,                 -- ⑩
  material_recommendations JSONB, -- ⑪
  expert_consensus JSONB,         -- ⑫
  controversies JSONB,            -- ⑬ 深度分析后的结构化结果
  belief_evolution JSONB,         -- ⑭
  cross_domain_insights JSONB,    -- ⑮

  -- 专家调用痕迹 [{ deliverable, expert_id, invoke_id, emm_pass, confidence }]
  expert_invocations JSONB DEFAULT '[]',

  model_version VARCHAR(50) DEFAULT 'v2.0-deep',
  analyzed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processing_time_ms INTEGER,

  CONSTRAINT unique_asset_deep_analysis UNIQUE (asset_id)
);

CREATE INDEX IF NOT EXISTS idx_ada_analyzed_at ON asset_deep_analysis(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ada_domain_experts ON asset_deep_analysis USING GIN (matched_domain_expert_ids);

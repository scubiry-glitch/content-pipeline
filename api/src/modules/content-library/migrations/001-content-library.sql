-- Content Library Module — Core Tables
-- 独立可执行，不依赖主项目 migration 工具
-- 灵感: Hindsight (4-网络模型) + Mem0 (事实提取) + RetainDB (delta 压缩)

-- ============================================================
-- Layer 1: 知识整合层 — 结构化事实
-- ============================================================

CREATE TABLE IF NOT EXISTS content_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(50),
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  context JSONB DEFAULT '{}',
  confidence DECIMAL(3,2) DEFAULT 0.5,
  is_current BOOLEAN DEFAULT true,
  superseded_by UUID REFERENCES content_facts(id),
  source_chunk_index INTEGER,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引: 事实查询
CREATE INDEX IF NOT EXISTS idx_content_facts_subject ON content_facts(subject);
CREATE INDEX IF NOT EXISTS idx_content_facts_predicate ON content_facts(predicate);
CREATE INDEX IF NOT EXISTS idx_content_facts_current ON content_facts(is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_content_facts_asset ON content_facts(asset_id);
CREATE INDEX IF NOT EXISTS idx_content_facts_context_domain ON content_facts USING GIN ((context->'domain'));
CREATE INDEX IF NOT EXISTS idx_content_facts_created ON content_facts(created_at DESC);

-- 索引: 矛盾检测 (同 subject+predicate 不同 object)
CREATE INDEX IF NOT EXISTS idx_content_facts_contradiction ON content_facts(subject, predicate)
  WHERE is_current = true;

-- ============================================================
-- Layer 1: 知识整合层 — 全局实体注册表
-- ============================================================

CREATE TABLE IF NOT EXISTS content_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  aliases TEXT[] DEFAULT '{}',
  entity_type VARCHAR(50) DEFAULT 'concept',
  taxonomy_domain_id VARCHAR(10),
  metadata JSONB DEFAULT '{}',
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引: 实体查询
CREATE INDEX IF NOT EXISTS idx_content_entities_type ON content_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_content_entities_domain ON content_entities(taxonomy_domain_id);
CREATE INDEX IF NOT EXISTS idx_content_entities_aliases ON content_entities USING GIN(aliases);

-- ============================================================
-- Layer 4: 跨内容推理层 — 观点/信念追踪
-- ============================================================

CREATE TABLE IF NOT EXISTS content_beliefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposition TEXT NOT NULL,
  current_stance VARCHAR(20) DEFAULT 'evolving',
  confidence DECIMAL(3,2) DEFAULT 0.5,
  supporting_facts UUID[] DEFAULT '{}',
  contradicting_facts UUID[] DEFAULT '{}',
  taxonomy_domain_id VARCHAR(10),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  history JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_content_beliefs_stance ON content_beliefs(current_stance);
CREATE INDEX IF NOT EXISTS idx_content_beliefs_domain ON content_beliefs(taxonomy_domain_id);

-- ============================================================
-- Layer 4: 生产经验记录
-- ============================================================

CREATE TABLE IF NOT EXISTS content_production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(50),
  asset_ids TEXT[] DEFAULT '{}',
  expert_ids TEXT[] DEFAULT '{}',
  output_quality_score DECIMAL(3,2),
  human_feedback_score SMALLINT,
  combination_insight TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_log_quality ON content_production_log(output_quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_production_log_task ON content_production_log(task_id);

-- ============================================================
-- Layer 2: 层级加载 — 扩展 asset_ai_analysis 表
-- ============================================================

-- 注意: 以下 ALTER TABLE 仅在 asset_ai_analysis 表已存在时执行
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'asset_ai_analysis') THEN
    ALTER TABLE asset_ai_analysis ADD COLUMN IF NOT EXISTS l0_summary TEXT;
    ALTER TABLE asset_ai_analysis ADD COLUMN IF NOT EXISTS l1_key_points TEXT[];
    ALTER TABLE asset_ai_analysis ADD COLUMN IF NOT EXISTS l1_token_count INTEGER;
  END IF;
END $$;

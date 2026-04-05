-- Expert Library — 独立 Schema Migration
-- 可在 pipeline DB 内执行，也可在独立 PostgreSQL 实例执行

-- ===== 专家 Profiles =====
CREATE TABLE IF NOT EXISTS expert_profiles (
  expert_id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  domain TEXT[] DEFAULT '{}',

  -- 人格层 (WHO)
  persona JSONB DEFAULT '{}',
  -- 方法层 (HOW)
  method JSONB DEFAULT '{}',
  -- EMM 门控规则
  emm JSONB,
  -- 约束
  constraints_config JSONB DEFAULT '{"must_conclude": true, "allow_assumption": false}',
  -- 输出 schema
  output_schema JSONB DEFAULT '{"format": "structured_report", "sections": []}',
  -- 反模式
  anti_patterns TEXT[] DEFAULT '{}',
  -- 标志性表达
  signature_phrases TEXT[] DEFAULT '{}',

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== 知识源 =====
CREATE TABLE IF NOT EXISTS expert_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id VARCHAR(50) NOT NULL REFERENCES expert_profiles(expert_id),
  source_type VARCHAR(50) NOT NULL,  -- 'meeting_minutes','interview','conference','publication','link'
  title VARCHAR(500) NOT NULL,
  original_file_url TEXT,
  parsed_content TEXT,
  summary TEXT,
  key_insights JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',       -- 时间/来源/参与者/主题标签
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_expert ON expert_knowledge_sources(expert_id, is_active);

-- ===== 调用记录 =====
CREATE TABLE IF NOT EXISTS expert_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id VARCHAR(50) NOT NULL REFERENCES expert_profiles(expert_id),
  task_type VARCHAR(50) NOT NULL,
  input_type VARCHAR(50) NOT NULL,
  input_summary TEXT,
  output_sections JSONB,
  input_analysis JSONB,
  emm_gates_passed TEXT[],
  confidence FLOAT,
  params JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invocations_expert ON expert_invocations(expert_id, created_at DESC);

-- ===== 反馈 =====
CREATE TABLE IF NOT EXISTS expert_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expert_id VARCHAR(50) NOT NULL REFERENCES expert_profiles(expert_id),
  invoke_id UUID REFERENCES expert_invocations(id),
  human_score SMALLINT CHECK (human_score BETWEEN 1 AND 5),
  human_notes TEXT,
  actual_outcome JSONB,    -- { metric_name, predicted_value, actual_value, measurement_date }
  comparison JSONB,         -- { better_than_baseline, baseline_value }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_expert ON expert_feedback(expert_id, created_at DESC);

-- ===== updated_at 自动更新 =====
CREATE OR REPLACE FUNCTION update_expert_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_expert_profiles_updated_at ON expert_profiles;
CREATE TRIGGER trg_expert_profiles_updated_at
  BEFORE UPDATE ON expert_profiles
  FOR EACH ROW EXECUTE FUNCTION update_expert_profiles_updated_at();

-- Meeting Notes Module · 004 — 知识轴 Knowledge axis
--
-- 子维度：可复用判断 / 心智模型激活 / 证据分级 / 认知偏误 / 反事实

-- ============================================================
-- 可复用判断 —— 从特定案例抽象出的判断，可跨会议复用
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  abstracted_from_meeting_id UUID NOT NULL,
  author_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  domain VARCHAR(80),
  generality_score DECIMAL(3,2) NOT NULL DEFAULT 0.5,  -- 0=极其具体 1=抽象普适
  reuse_count INT NOT NULL DEFAULT 0,
  linked_meeting_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  embedding vector(768),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_judgments_domain ON mn_judgments(domain);
CREATE INDEX IF NOT EXISTS idx_mn_judgments_reuse
  ON mn_judgments(reuse_count DESC, generality_score DESC);

DROP TRIGGER IF EXISTS trg_mn_judgments_updated_at ON mn_judgments;
CREATE TRIGGER trg_mn_judgments_updated_at
  BEFORE UPDATE ON mn_judgments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 心智模型激活 —— 哪些模型被哪个人用，正确 or 错误
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_mental_model_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  model_name VARCHAR(120) NOT NULL,
  invoked_by_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  correctly_used BOOLEAN,
  outcome TEXT,
  expert_source VARCHAR(80),  -- 关联到 mn_judgments.domain 或 expert_id
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_mmi_model_meeting
  ON mn_mental_model_invocations(model_name, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_mmi_person
  ON mn_mental_model_invocations(invoked_by_person_id);

-- ============================================================
-- 认知偏误
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_cognitive_biases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  bias_type VARCHAR(60) NOT NULL,    -- anchoring / overconfidence / confirmation / survivorship / sunk_cost
  where_excerpt TEXT,
  by_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  severity VARCHAR(8) NOT NULL DEFAULT 'med'
    CHECK (severity IN ('low','med','high')),
  mitigated BOOLEAN NOT NULL DEFAULT FALSE,
  mitigation_strategy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_biases_meeting ON mn_cognitive_biases(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_biases_type ON mn_cognitive_biases(bias_type, severity);

-- ============================================================
-- 反事实 —— 被否决的路径，后续验证
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_counterfactuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  rejected_path TEXT NOT NULL,
  rejected_at_decision_id UUID REFERENCES mn_decisions(id) ON DELETE SET NULL,
  rejected_by_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  tracking_note TEXT,
  next_validity_check_at TIMESTAMPTZ,
  current_validity VARCHAR(12) DEFAULT 'unclear'
    CHECK (current_validity IN ('valid','invalid','unclear')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_counterfactuals_check
  ON mn_counterfactuals(next_validity_check_at)
  WHERE next_validity_check_at IS NOT NULL AND current_validity = 'unclear';

DROP TRIGGER IF EXISTS trg_mn_counterfactuals_updated_at ON mn_counterfactuals;
CREATE TRIGGER trg_mn_counterfactuals_updated_at
  BEFORE UPDATE ON mn_counterfactuals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 证据分布聚合 —— meeting 粒度，A/B/C/D 分布 + 加权分
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_evidence_grades (
  meeting_id UUID PRIMARY KEY,
  dist_a INT NOT NULL DEFAULT 0,
  dist_b INT NOT NULL DEFAULT 0,
  dist_c INT NOT NULL DEFAULT 0,
  dist_d INT NOT NULL DEFAULT 0,
  -- A=4 B=3 C=2 D=1 的加权均值
  weighted_score DECIMAL(4,2) NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_evidence_grades, mn_counterfactuals,
--                         mn_cognitive_biases, mn_mental_model_invocations,
--                         mn_judgments CASCADE;
-- ============================================================

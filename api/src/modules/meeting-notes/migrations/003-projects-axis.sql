-- Meeting Notes Module · 003 — 项目轴 Projects axis
--
-- 子维度：决议溯源 / 假设清单 / 开放问题 / 风险热度

-- ============================================================
-- 决策节点（形成 DAG：based_on[] + superseded_by）
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  meeting_id UUID NOT NULL,
  title VARCHAR(400) NOT NULL,
  proposer_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  based_on_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],     -- 引用前置决策
  superseded_by_id UUID REFERENCES mn_decisions(id) ON DELETE SET NULL,
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  rationale TEXT,
  embedding vector(768),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_decisions_scope_current
  ON mn_decisions(scope_id, is_current) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_mn_decisions_meeting ON mn_decisions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_decisions_based_on
  ON mn_decisions USING GIN (based_on_ids);

DROP TRIGGER IF EXISTS trg_mn_decisions_updated_at ON mn_decisions;
CREATE TRIGGER trg_mn_decisions_updated_at
  BEFORE UPDATE ON mn_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 假设清单 —— 承托决策的未验证信念
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  meeting_id UUID NOT NULL,
  text TEXT NOT NULL,
  evidence_grade CHAR(1) NOT NULL DEFAULT 'C'
    CHECK (evidence_grade IN ('A','B','C','D')),     -- A=硬数据 B=类比 C=直觉 D=道听途说
  verification_state VARCHAR(16) NOT NULL DEFAULT 'unverified'
    CHECK (verification_state IN ('unverified','verifying','confirmed','falsified')),
  verifier_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  underpins_decision_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_assumptions_scope_state
  ON mn_assumptions(scope_id, verification_state);
CREATE INDEX IF NOT EXISTS idx_mn_assumptions_underpins
  ON mn_assumptions USING GIN (underpins_decision_ids);
CREATE INDEX IF NOT EXISTS idx_mn_assumptions_grade_due
  ON mn_assumptions(evidence_grade, due_at) WHERE evidence_grade IN ('C','D');

DROP TRIGGER IF EXISTS trg_mn_assumptions_updated_at ON mn_assumptions;
CREATE TRIGGER trg_mn_assumptions_updated_at
  BEFORE UPDATE ON mn_assumptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 开放问题 —— 跨会议持续追踪
-- 3+ 次被 raise 且未 owner 即标 chronic
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_open_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'operational'
    CHECK (category IN ('strategic','analytical','governance','operational')),
  status VARCHAR(16) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','assigned','chronic','resolved')),
  times_raised INT NOT NULL DEFAULT 1,
  first_raised_meeting_id UUID,
  last_raised_meeting_id UUID,
  owner_person_id UUID REFERENCES mn_people(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_open_questions_scope_status
  ON mn_open_questions(scope_id, status);
CREATE INDEX IF NOT EXISTS idx_mn_open_questions_chronic
  ON mn_open_questions(times_raised DESC) WHERE status = 'chronic';

DROP TRIGGER IF EXISTS trg_mn_open_questions_updated_at ON mn_open_questions;
CREATE TRIGGER trg_mn_open_questions_updated_at
  BEFORE UPDATE ON mn_open_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 风险热度 —— heat = mentions × severity × (1 if unactioned)
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  severity VARCHAR(12) NOT NULL DEFAULT 'med'
    CHECK (severity IN ('low','med','high','critical')),
  mention_count INT NOT NULL DEFAULT 1,
  heat_score DECIMAL(6,2) NOT NULL DEFAULT 0,
  trend VARCHAR(8) NOT NULL DEFAULT 'flat'
    CHECK (trend IN ('up','flat','down')),
  action_taken BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_risks_scope_heat
  ON mn_risks(scope_id, heat_score DESC) WHERE action_taken = FALSE;

DROP TRIGGER IF EXISTS trg_mn_risks_updated_at ON mn_risks;
CREATE TRIGGER trg_mn_risks_updated_at
  BEFORE UPDATE ON mn_risks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_risks, mn_open_questions, mn_assumptions, mn_decisions CASCADE;
-- ============================================================

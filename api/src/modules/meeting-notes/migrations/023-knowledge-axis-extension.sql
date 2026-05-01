-- Meeting Notes Module · 023 — 知识轴扩展（5 张表）
--
-- 背景：归档版（07-archive/会议纪要 20260502）定义知识轴 10 个子维度，
-- 现网 004-knowledge-axis.sql 只落了 5 个，本 migration 补齐另外 5 个：
--   - mn_model_hitrates       (心智模型命中率 6 个月校准)
--   - mn_consensus_tracks     (共识/分歧轨迹)
--   - mn_concept_drifts       (同词不同义诊断)
--   - mn_topic_lineage        (议题谱系：出生/健康/濒危)
--   - mn_external_experts     (外部专家库注释)
--
-- 全部 idempotent (CREATE TABLE/INDEX IF NOT EXISTS)。

-- ============================================================
-- 心智模型命中率 —— 6 个月滚动窗口校准（model_name 维度聚合）
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_model_hitrates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID,                                -- NULL = library 维度
  model_name VARCHAR(120) NOT NULL,
  window_label VARCHAR(16) NOT NULL DEFAULT '6m',  -- 7d/30d/90d/6m/1y/all
  total_invocations INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  hit_rate DECIMAL(4,3) NOT NULL DEFAULT 0,     -- 0..1
  calibration_note TEXT,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 一个 (scope, model, window) 只保留一行最新值；用 unique 约束 + ON CONFLICT 覆盖
CREATE UNIQUE INDEX IF NOT EXISTS uq_mn_model_hitrates_scope_model_window
  ON mn_model_hitrates(COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), model_name, window_label);

CREATE INDEX IF NOT EXISTS idx_mn_model_hitrates_scope_rate
  ON mn_model_hitrates(scope_id, hit_rate DESC);

DROP TRIGGER IF EXISTS trg_mn_model_hitrates_updated_at ON mn_model_hitrates;
CREATE TRIGGER trg_mn_model_hitrates_updated_at
  BEFORE UPDATE ON mn_model_hitrates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 共识/分歧轨迹 —— 一个 topic 在某次会议上的共识程度
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_consensus_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID,
  topic VARCHAR(200) NOT NULL,
  meeting_id UUID NOT NULL,
  consensus_score DECIMAL(3,2) NOT NULL DEFAULT 0.5,   -- 0=分裂 1=完全一致
  divergence_persons JSONB NOT NULL DEFAULT '[]'::jsonb,
  dominant_view TEXT,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_consensus_topic_scope
  ON mn_consensus_tracks(scope_id, topic, meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_consensus_score
  ON mn_consensus_tracks(consensus_score);

-- ============================================================
-- 概念漂移 —— 同一个 term 在不同会议中含义不同
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_concept_drifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID,
  term VARCHAR(200) NOT NULL,
  -- jsonb 形如: [{ meeting_id, def_text, by_person_id, observed_at }]
  definition_at_meeting JSONB NOT NULL DEFAULT '[]'::jsonb,
  drift_severity VARCHAR(8) NOT NULL DEFAULT 'low'
    CHECK (drift_severity IN ('low', 'med', 'high', 'critical')),
  first_observed_at TIMESTAMPTZ,
  last_observed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mn_concept_drifts_scope_term
  ON mn_concept_drifts(COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), term);
CREATE INDEX IF NOT EXISTS idx_mn_concept_drifts_severity
  ON mn_concept_drifts(drift_severity);

DROP TRIGGER IF EXISTS trg_mn_concept_drifts_updated_at ON mn_concept_drifts;
CREATE TRIGGER trg_mn_concept_drifts_updated_at
  BEFORE UPDATE ON mn_concept_drifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 议题谱系 —— 一个议题的出生 / 健康 / 濒危状态追踪
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_topic_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID,
  topic VARCHAR(200) NOT NULL,
  birth_meeting_id UUID,
  health_state VARCHAR(16) NOT NULL DEFAULT 'alive'
    CHECK (health_state IN ('alive', 'endangered', 'dead')),
  last_active_at TIMESTAMPTZ,
  -- jsonb 形如: [{ meeting_id, role: 'birth'|'mention'|'decision'|'death', at }]
  lineage_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
  mention_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mn_topic_lineage_scope_topic
  ON mn_topic_lineage(COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), topic);
CREATE INDEX IF NOT EXISTS idx_mn_topic_lineage_health
  ON mn_topic_lineage(health_state, last_active_at DESC);

DROP TRIGGER IF EXISTS trg_mn_topic_lineage_updated_at ON mn_topic_lineage;
CREATE TRIGGER trg_mn_topic_lineage_updated_at
  BEFORE UPDATE ON mn_topic_lineage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 外部专家注释 —— 引用的外部专家库 / 心智模型来源
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_external_experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  domain VARCHAR(80),
  cited_in_meetings JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ meeting_id, by_person_id, citation_text }]
  cite_count INT NOT NULL DEFAULT 0,
  accuracy_score DECIMAL(3,2),                            -- 引用结论的事后准确度 0..1
  expert_source_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mn_external_experts_name_domain
  ON mn_external_experts(name, COALESCE(domain, ''));
CREATE INDEX IF NOT EXISTS idx_mn_external_experts_cite
  ON mn_external_experts(cite_count DESC);

DROP TRIGGER IF EXISTS trg_mn_external_experts_updated_at ON mn_external_experts;
CREATE TRIGGER trg_mn_external_experts_updated_at
  BEFORE UPDATE ON mn_external_experts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ROLLBACK:
--   DROP TABLE IF EXISTS mn_external_experts CASCADE;
--   DROP TABLE IF EXISTS mn_topic_lineage CASCADE;
--   DROP TABLE IF EXISTS mn_concept_drifts CASCADE;
--   DROP TABLE IF EXISTS mn_consensus_tracks CASCADE;
--   DROP TABLE IF EXISTS mn_model_hitrates CASCADE;

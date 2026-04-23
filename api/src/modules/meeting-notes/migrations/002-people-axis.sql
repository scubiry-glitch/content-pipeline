-- Meeting Notes Module · 002 — 人物轴 People axis
--
-- 子维度：承诺兑现 / 角色演化 / 发言质量 / 沉默信号
-- 核心实体：mn_people（跨会议稳定人物）
--
-- 依赖：001 (mn_scopes/mn_scope_members), assets 表存在 meeting_id→assets(id)

-- ============================================================
-- 跨会议稳定的人物实体（与 asset.metadata.participants 去重）
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name VARCHAR(200) NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  role VARCHAR(120),
  org VARCHAR(200),
  email_hash VARCHAR(64),
  embedding vector(768),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_name, org)
);

CREATE INDEX IF NOT EXISTS idx_mn_people_canonical
  ON mn_people USING GIN (to_tsvector('simple', canonical_name));
CREATE INDEX IF NOT EXISTS idx_mn_people_aliases
  ON mn_people USING GIN (aliases);

DROP TRIGGER IF EXISTS trg_mn_people_updated_at ON mn_people;
CREATE TRIGGER trg_mn_people_updated_at
  BEFORE UPDATE ON mn_people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 承诺兑现 —— 跨会议承诺 ledger
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,  -- assets.id (asset_type='meeting_minutes')
  person_id UUID NOT NULL REFERENCES mn_people(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  state VARCHAR(16) NOT NULL DEFAULT 'on_track'
    CHECK (state IN ('on_track','at_risk','done','slipped')),
  progress DECIMAL(5,2) NOT NULL DEFAULT 0,  -- 0-100
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_turn INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_commitments_person ON mn_commitments(person_id);
CREATE INDEX IF NOT EXISTS idx_mn_commitments_meeting ON mn_commitments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mn_commitments_state_due
  ON mn_commitments(state, due_at) WHERE state IN ('on_track','at_risk');

DROP TRIGGER IF EXISTS trg_mn_commitments_updated_at ON mn_commitments;
CREATE TRIGGER trg_mn_commitments_updated_at
  BEFORE UPDATE ON mn_commitments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 角色演化 —— 每会议 × 人物一条轨迹点
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_role_trajectory_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES mn_people(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  scope_id UUID REFERENCES mn_scopes(id) ON DELETE SET NULL,
  role_label VARCHAR(60) NOT NULL,  -- proposer / challenger / decider / moderator 等
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (person_id, meeting_id, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_role_trajectory_person_time
  ON mn_role_trajectory_points(person_id, detected_at DESC);

-- ============================================================
-- 发言质量 —— meeting × person 粒度
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_speech_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  person_id UUID NOT NULL REFERENCES mn_people(id) ON DELETE CASCADE,
  entropy_pct DECIMAL(5,2) NOT NULL DEFAULT 0,      -- 0-100
  followed_up_count INT NOT NULL DEFAULT 0,
  quality_score DECIMAL(5,2) NOT NULL DEFAULT 0,    -- entropy*0.6 + followups*0.4 归一
  sample_quotes JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (meeting_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_speech_quality_meeting ON mn_speech_quality(meeting_id);

-- ============================================================
-- 沉默信号 —— meeting × person × topic 稀疏矩阵
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_silence_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL,
  person_id UUID NOT NULL REFERENCES mn_people(id) ON DELETE CASCADE,
  topic_id VARCHAR(80) NOT NULL,  -- 宽松 id，既可绑 topic 实体亦可纯字符串
  state VARCHAR(20) NOT NULL
    CHECK (state IN ('spoke','normal_silence','abnormal_silence','absent')),
  prior_topics_spoken INT NOT NULL DEFAULT 0,
  anomaly_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (meeting_id, person_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_mn_silence_abnormal
  ON mn_silence_signals(meeting_id, state) WHERE state = 'abnormal_silence';

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_silence_signals, mn_speech_quality,
--                         mn_role_trajectory_points, mn_commitments, mn_people CASCADE;
-- ============================================================

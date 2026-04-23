-- Meeting Notes Module · 005 — 会议本身轴 Meta/Meeting axis
--
-- 子维度：决策质量 / 必要性审计 / 情绪热力曲线
-- 所有三张都以 meeting_id 为 PK（单会议聚合）

-- ============================================================
-- 决策质量 5 维打分
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_decision_quality (
  meeting_id UUID PRIMARY KEY,
  overall DECIMAL(3,2) NOT NULL DEFAULT 0,

  -- 5 dimensions (0-1 each)
  clarity     DECIMAL(3,2) NOT NULL DEFAULT 0,
  actionable  DECIMAL(3,2) NOT NULL DEFAULT 0,
  traceable   DECIMAL(3,2) NOT NULL DEFAULT 0,
  falsifiable DECIMAL(3,2) NOT NULL DEFAULT 0,
  aligned     DECIMAL(3,2) NOT NULL DEFAULT 0,

  notes JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 每维的 gap 说明
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_decision_quality_overall
  ON mn_decision_quality(overall DESC);

-- ============================================================
-- 必要性审计 —— 会议应不应该是异步
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_meeting_necessity (
  meeting_id UUID PRIMARY KEY,
  verdict VARCHAR(12) NOT NULL DEFAULT 'needed'
    CHECK (verdict IN ('async_ok','partial','needed')),
  suggested_duration_min INT,                -- 比当前缩短多少分钟
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{k: 'async_ok_section', t: 'xx 段可异步', ratio: 0.3}, ...]
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mn_meeting_necessity_verdict
  ON mn_meeting_necessity(verdict);

-- ============================================================
-- 情绪热力曲线 —— 时间序列 + 拐点标记
-- ============================================================
CREATE TABLE IF NOT EXISTS mn_affect_curve (
  meeting_id UUID PRIMARY KEY,
  -- [{t_sec: number, valence: -1..1, intensity: 0..1, tag?: 'T1'|'N3'|'decision_resolved'|...}]
  samples JSONB NOT NULL DEFAULT '[]'::jsonb,
  tension_peaks JSONB NOT NULL DEFAULT '[]'::jsonb,
  insight_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Rollback (manual):
--   DROP TABLE IF EXISTS mn_affect_curve, mn_meeting_necessity, mn_decision_quality CASCADE;
-- ============================================================

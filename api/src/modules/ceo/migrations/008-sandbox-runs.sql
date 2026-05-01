-- CEO Module · 008 — War Room 兵棋推演 sandbox 表
--
-- 设计：每条 row 是一次 "topic + branches" 的推演。Topic 来自 Sparks 卡或自定义提议。
-- branches: 决策树 jsonb {root: {label, options: [{label, confidence, expected, children: [...]}]}}
-- evaluation: LLM 给出的总体评估 {recommendedPath, riskScore, expectedReversibility, summaryMd}

CREATE TABLE IF NOT EXISTS ceo_sandbox_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NULL,
  topic_text TEXT NOT NULL,                    -- 推演主题 (e.g. "Q2 投资决策推演 · AI 基础设施加配 $40M")
  source_spark_id UUID NULL,                   -- 弱引 ceo_war_room_sparks.id (从 spark 启动时记录)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed','archived')),
  branches JSONB NOT NULL DEFAULT '[]'::jsonb, -- 决策树
  evaluation JSONB NULL,                       -- LLM 总评 {recommendedPath, riskScore, summaryMd, ...}
  generated_run_id TEXT NULL,                  -- 弱引 mn_runs.id (g3 LLM 任务)
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ceo_sandbox_runs_scope
  ON ceo_sandbox_runs (scope_id, created_at DESC) WHERE scope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ceo_sandbox_runs_status
  ON ceo_sandbox_runs (status, created_at DESC);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ceo_sandbox_runs_status;
--   DROP INDEX IF EXISTS idx_ceo_sandbox_runs_scope;
--   DROP TABLE IF EXISTS ceo_sandbox_runs;

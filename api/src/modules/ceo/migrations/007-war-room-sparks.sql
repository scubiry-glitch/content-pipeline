-- CEO Module · 007 — War Room 灵光一闪 sparks 表
--
-- 当前由 seed 数据填充 (12 张候选卡)，供"再来一组"按钮在不同 seed 间切换。
-- 后续 g3 LLM 任务可往这张表写自动生成的卡片，前端不感知。

CREATE TABLE IF NOT EXISTS ceo_war_room_sparks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id UUID NULL,
  tag TEXT NOT NULL,                    -- 标签 (e.g. "🔮 跨项目人才嫁接")
  headline TEXT NOT NULL,               -- 标题 (含主体加粗信息)
  evidence_short TEXT,                  -- 正面证据简述 (1 句)
  why_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,    -- 背面 Why 列表 (3 条 evidence)
  risk_text TEXT,                       -- 背面 风险提示
  seed_group SMALLINT NOT NULL DEFAULT 0,  -- 0/1/2 用于 reroll 切组
  generated_run_id TEXT,                -- 弱引 mn_runs.id (g3 LLM 任务)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_war_room_sparks_seed_group
  ON ceo_war_room_sparks (seed_group);

CREATE INDEX IF NOT EXISTS idx_ceo_war_room_sparks_scope
  ON ceo_war_room_sparks (scope_id) WHERE scope_id IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ceo_war_room_sparks_scope;
--   DROP INDEX IF EXISTS idx_ceo_war_room_sparks_seed_group;
--   DROP TABLE IF EXISTS ceo_war_room_sparks;

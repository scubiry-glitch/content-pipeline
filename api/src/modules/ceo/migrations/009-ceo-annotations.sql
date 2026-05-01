-- CEO Module · 009 — 外脑批注表 (Boardroom ③) + Balcony 反思 prompt 字段补丁
--
-- 用途:
--   - ceo_boardroom_annotations: g4-annotations LLM 任务产物 (替代原 fixture)
--     一份预读包 (brief) 可被 N 个外部专家 (expert_id) 批注，每人若干条
--   - ceo_balcony_reflections.prompt 字段已存在 (005)，本次仅加 g4-balcony-prompt
--     handler 生成 (无需 schema 变更)

CREATE TABLE IF NOT EXISTS ceo_boardroom_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID NULL,                     -- 弱引 ceo_briefs.id
  scope_id UUID NULL,
  expert_id TEXT NOT NULL,                -- 弱引 expert-library experts.expert_id
  expert_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'synthesis'  -- synthesis / contrast / counter / extension
    CHECK (mode IN ('synthesis','contrast','counter','extension')),
  highlight TEXT NOT NULL,                -- 一句话核心观点 (展示用)
  body_md TEXT NOT NULL,                  -- 完整批注正文 (Markdown)
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{type:'meeting'|'asset'|'echo', id, label}]
  generated_run_id TEXT NULL,             -- 弱引 mn_runs.id (g4-annotations)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ceo_boardroom_annotations_brief
  ON ceo_boardroom_annotations (brief_id, created_at DESC) WHERE brief_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ceo_boardroom_annotations_scope
  ON ceo_boardroom_annotations (scope_id, created_at DESC) WHERE scope_id IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ceo_boardroom_annotations_scope;
--   DROP INDEX IF EXISTS idx_ceo_boardroom_annotations_brief;
--   DROP TABLE IF EXISTS ceo_boardroom_annotations;

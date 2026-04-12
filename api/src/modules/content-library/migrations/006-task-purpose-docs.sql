-- Content Library v7.2 — T2.3: task_purpose_docs 目标锚定
-- 每个 Task 绑定一个"意图书"(受 llm_wiki purpose.md 启发)
-- Content Library 查询时读取它来加权议题推荐

CREATE TABLE IF NOT EXISTS task_purpose_docs (
  task_id       VARCHAR(50) PRIMARY KEY,
  purpose_text  TEXT NOT NULL,
  goal_entities TEXT[] DEFAULT '{}',
  embedding     vector(768),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_purpose_entities
  ON task_purpose_docs USING GIN(goal_entities);

COMMENT ON TABLE task_purpose_docs IS
  'Per-task purpose document (goal anchoring). Read by Content Library before query/generation.';

-- CEO Module · 006 — Person ↔ Expert agent 链接
--
-- 设计：人物轴的某个 person (mn_people.id) 可以绑定一个专家 (expert-library expert_id 字符串)；
-- CEO 视角调用该 person 时走 expert-library /invoke + 拼 person 上下文。
--
-- 一个 person 只能绑一个 expert (UNIQUE)，简化模型；后续如要多绑可去掉约束。

CREATE TABLE IF NOT EXISTS ceo_person_agent_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL,                    -- 弱引 mn_people.id (跨模块不强制 FK)
  expert_id TEXT NOT NULL,                    -- expert-library expert_id (slug)
  custom_persona_overrides JSONB,             -- 可选 persona 改写 {tone?, style?, framework_hints?}
  default_task_type TEXT NOT NULL DEFAULT 'analysis'
    CHECK (default_task_type IN ('analysis','evaluation','generation')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_invoked_at TIMESTAMPTZ,
  invoke_count INT NOT NULL DEFAULT 0,
  UNIQUE (person_id)
);

CREATE INDEX IF NOT EXISTS idx_ceo_person_agent_links_person
  ON ceo_person_agent_links (person_id);

CREATE INDEX IF NOT EXISTS idx_ceo_person_agent_links_expert
  ON ceo_person_agent_links (expert_id);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ceo_person_agent_links_expert;
--   DROP INDEX IF EXISTS idx_ceo_person_agent_links_person;
--   DROP TABLE IF EXISTS ceo_person_agent_links;

-- CEO Module · 001 — 六棱镜 + 房间核心表
--
-- ceo_prisms          每周一个棱镜快照（六维度指标）
-- ceo_prism_weights   棱镜权重设置（target vs actual）
--
-- 跨模块仅以 source_module + source_id 弱引用 mn_*，不设跨模块外键。
-- scope_id 含义：与 mn_scopes.id 兼容（workspace 概念后续 PR 引入）

CREATE TABLE IF NOT EXISTS ceo_prisms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id        UUID NULL,                          -- 弱引 mn_scopes.id
  week_start      DATE NOT NULL,                      -- 周一
  alignment       NUMERIC(4,3) NULL,                  -- direction (Compass)  战略对齐度
  board_score     NUMERIC(4,3) NULL,                  -- board (Boardroom)    前瞻占比
  coord           NUMERIC(4,3) NULL,                  -- coord (Tower)        责任清晰度
  team            NUMERIC(4,3) NULL,                  -- team (War Room)      阵型健康
  ext             NUMERIC(4,3) NULL,                  -- ext (Situation)      利益相关方覆盖度
  self            NUMERIC(4,3) NULL,                  -- self (Balcony)       时间 ROI
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (scope_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ceo_prisms_week
  ON ceo_prisms (week_start DESC);

CREATE INDEX IF NOT EXISTS idx_ceo_prisms_scope_week
  ON ceo_prisms (scope_id, week_start DESC) WHERE scope_id IS NOT NULL;

-- 棱镜权重 — user-level (每位 CEO 自己的目标)
CREATE TABLE IF NOT EXISTS ceo_prism_weights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,                      -- accounts.id 或匿名 'system' 占位
  prism           TEXT NOT NULL                       -- direction|board|coord|team|ext|self
                  CHECK (prism IN ('direction','board','coord','team','ext','self')),
  target_pct      INT NOT NULL CHECK (target_pct BETWEEN 0 AND 100),
  actual_pct      INT NOT NULL DEFAULT 0 CHECK (actual_pct BETWEEN 0 AND 100),
  week_start      DATE NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, prism, week_start)
);

CREATE INDEX IF NOT EXISTS idx_ceo_prism_weights_user_week
  ON ceo_prism_weights (user_id, week_start DESC);

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_ceo_prism_weights_user_week;
--   DROP TABLE IF EXISTS ceo_prism_weights;
--   DROP INDEX IF EXISTS idx_ceo_prisms_scope_week;
--   DROP INDEX IF EXISTS idx_ceo_prisms_week;
--   DROP TABLE IF EXISTS ceo_prisms;

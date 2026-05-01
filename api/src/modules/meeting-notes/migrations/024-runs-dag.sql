-- Meeting Notes Module · 024 — mn_runs DAG (L1 体征 → L2 聚合)
--
-- 背景：归档版设计稿暗含「per-meeting 体征 → cross-meeting 聚合」两层依赖；
-- 现网 mn_runs 队列里所有 axis 平等独立，只能靠人工/cron 顺序保障。
-- 本 migration 加 stage / depends_on / trigger_meeting_id 字段让 DAG 显式化。
--
-- 设计要点：
--   - stage NULL = 兼容老调用方（独立 enqueue API 路径仍可用，不走 DAG 校验）
--   - stage='L1_meeting' = per-meeting 体征（meta + tension）
--   - stage='L2_aggregate' = 跨会聚合（people / projects / knowledge）
--   - depends_on UUID[] 指向必须 succeeded 的上游 run
--   - trigger_meeting_id：L1 来源会议；L2 fan-out 时记录上游
--
-- 兼容性：所有字段都是 nullable / 有默认值，老数据零影响。

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS stage TEXT
    CHECK (stage IS NULL OR stage IN ('L1_meeting', 'L2_aggregate'));

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS depends_on UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE mn_runs
  ADD COLUMN IF NOT EXISTS trigger_meeting_id UUID;

-- 反向查询：给定一条 L1，找它 fan-out 出的所有 L2
CREATE INDEX IF NOT EXISTS idx_mn_runs_depends_gin
  ON mn_runs USING gin (depends_on);

-- 调度器轮询：找所有 stage='L2_aggregate' AND state='queued' 检查依赖
CREATE INDEX IF NOT EXISTS idx_mn_runs_stage_state
  ON mn_runs(stage, state) WHERE stage IS NOT NULL;

-- 按触发会议查 L1+L2 链路（生成中心 UI 详情面板）
CREATE INDEX IF NOT EXISTS idx_mn_runs_trigger_meeting
  ON mn_runs(trigger_meeting_id, stage, created_at DESC) WHERE trigger_meeting_id IS NOT NULL;

-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_mn_runs_trigger_meeting;
--   DROP INDEX IF EXISTS idx_mn_runs_stage_state;
--   DROP INDEX IF EXISTS idx_mn_runs_depends_gin;
--   ALTER TABLE mn_runs DROP COLUMN IF EXISTS trigger_meeting_id;
--   ALTER TABLE mn_runs DROP COLUMN IF EXISTS depends_on;
--   ALTER TABLE mn_runs DROP COLUMN IF EXISTS stage;

-- CEO Module · 010 — ceo_stakeholders.escalation_path
--
-- 升级路径 — 在 Situation/StakeholderHeatmap 的同心圆中显示 owner / deputy / due / status。
-- 编辑入口走 meeting-notes 应用 → 人轴 → 人物管理弹窗（与 mn_people 通过 name/role 弱匹配）。
--
-- 形态：
--   {"owner": "CEO", "deputy": "陆景行", "due": "2026-05-12 BOARD #14", "status": "in_progress · 起草中"}

ALTER TABLE ceo_stakeholders
  ADD COLUMN IF NOT EXISTS escalation_path JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ROLLBACK:
--   ALTER TABLE ceo_stakeholders DROP COLUMN IF EXISTS escalation_path;

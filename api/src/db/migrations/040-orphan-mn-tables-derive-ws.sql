-- 040-orphan-mn-tables-derive-ws.sql
-- 修复 4 张孤儿 mn_* 表的 workspace_id 派生问题:
--   mn_judgments        ← abstracted_from_meeting_id (assets.workspace_id)
--   mn_consensus_sides  ← item_id (mn_consensus_items.workspace_id)
--   mn_tension_moments  ← tension_id (mn_tensions.workspace_id)
--   mn_people           ← first_seen_meeting_id (assets.workspace_id, 选项 B: 同一人在两个 ws 是两条记录)
--
-- 同时 DROP DEFAULT 这 4 张表的 workspace_id (与 038 一致), 让漏传 INSERT
-- 直接 NOT NULL 报错而不是静默落到 default ws.

BEGIN;

-- ============================================================
-- mn_people: 加 first_seen_meeting_id 列 (选项 B)
-- ============================================================
ALTER TABLE mn_people ADD COLUMN IF NOT EXISTS first_seen_meeting_id UUID;
CREATE INDEX IF NOT EXISTS idx_mn_people_first_seen_meeting ON mn_people(first_seen_meeting_id);

-- ============================================================
-- 新增 4 个 trigger 函数
-- ============================================================

CREATE OR REPLACE FUNCTION inherit_ws_from_abstracted_meeting() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.abstracted_from_meeting_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM assets WHERE id::text = NEW.abstracted_from_meeting_id::text LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_first_seen_meeting() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.first_seen_meeting_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM assets WHERE id::text = NEW.first_seen_meeting_id::text LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_consensus_item() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.item_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM mn_consensus_items WHERE id = NEW.item_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION inherit_ws_from_tension() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.tension_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
      FROM mn_tensions WHERE id = NEW.tension_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 挂 trigger
-- ============================================================
DROP TRIGGER IF EXISTS trg_ws_inherit ON mn_judgments;
CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON mn_judgments
  FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_abstracted_meeting();

DROP TRIGGER IF EXISTS trg_ws_inherit ON mn_people;
CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON mn_people
  FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_first_seen_meeting();

DROP TRIGGER IF EXISTS trg_ws_inherit ON mn_consensus_sides;
CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON mn_consensus_sides
  FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_consensus_item();

DROP TRIGGER IF EXISTS trg_ws_inherit ON mn_tension_moments;
CREATE TRIGGER trg_ws_inherit BEFORE INSERT ON mn_tension_moments
  FOR EACH ROW EXECUTE FUNCTION inherit_ws_from_tension();

-- ============================================================
-- DROP DEFAULT (与 038 一致)
-- 老 callsite 漏传 workspace_id, trigger 派生不到时, NOT NULL 直接报错
-- 提早暴露 bug 比静默落到 default ws 安全
-- ============================================================
ALTER TABLE mn_judgments        ALTER COLUMN workspace_id DROP DEFAULT;
ALTER TABLE mn_people           ALTER COLUMN workspace_id DROP DEFAULT;
ALTER TABLE mn_consensus_sides  ALTER COLUMN workspace_id DROP DEFAULT;
ALTER TABLE mn_tension_moments  ALTER COLUMN workspace_id DROP DEFAULT;

COMMIT;

-- 验证:
-- SELECT count(*) FROM pg_trigger WHERE tgname='trg_ws_inherit';  -- 应 = 36 (032 的 32 + 040 新加 4)
-- SELECT column_default FROM information_schema.columns
--   WHERE column_name='workspace_id' AND table_name IN ('mn_judgments','mn_people','mn_consensus_sides','mn_tension_moments');
--   全应 NULL

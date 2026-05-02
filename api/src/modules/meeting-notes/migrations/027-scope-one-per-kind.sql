-- 027-scope-one-per-kind.sql
-- 每个会议在每种 scope kind（project/client/topic）下只保留一条 binding。
-- 触发器在 INSERT 前删除同 meeting 同 kind 的旧 binding，实现"移动即替换"语义。

-- Step 1: 清理存量重复数据，每个 (meeting_id, kind) 只保留最新一条
DELETE FROM mn_scope_members
WHERE (scope_id, meeting_id) IN (
  SELECT scope_id, meeting_id FROM (
    SELECT sm.scope_id, sm.meeting_id,
           ROW_NUMBER() OVER (
             PARTITION BY sm.meeting_id, s.kind
             ORDER BY sm.bound_at DESC
           ) AS rn
    FROM mn_scope_members sm
    JOIN mn_scopes s ON s.id = sm.scope_id
  ) ranked
  WHERE rn > 1
);

-- Step 2: 触发器函数——INSERT 前删除同 meeting 同 kind 的旧 binding
CREATE OR REPLACE FUNCTION mn_scope_members_one_per_kind()
RETURNS TRIGGER AS $$
DECLARE
  new_kind text;
BEGIN
  SELECT kind INTO new_kind FROM mn_scopes WHERE id = NEW.scope_id;
  IF new_kind IS NOT NULL THEN
    DELETE FROM mn_scope_members sm
    USING mn_scopes s
    WHERE sm.meeting_id = NEW.meeting_id
      AND s.id = sm.scope_id
      AND s.kind = new_kind
      AND sm.scope_id != NEW.scope_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: 绑定触发器
DROP TRIGGER IF EXISTS trg_scope_members_one_per_kind ON mn_scope_members;
CREATE TRIGGER trg_scope_members_one_per_kind
  BEFORE INSERT ON mn_scope_members
  FOR EACH ROW EXECUTE FUNCTION mn_scope_members_one_per_kind();

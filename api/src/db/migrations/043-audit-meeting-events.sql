-- 043-audit-meeting-events.sql
-- 扩展 auth_audit_log.event 枚举,加入会议级安全事件:
--   meeting.imported  把别人分享的会议复制到自己 ws (asset-only fork)
--   meeting.shared    创建公开分享 token (顺手补上,跟 imported 是一对)
--
-- 背景: 036 加 audit log 时只覆盖 auth/admin 事件;现在 mn-share import 端点
-- (POST /shared/:token/import) 落地后需要审计跨 ws 的资产复制行为,
-- 用同一张 auth_audit_log 表延续既有读取/锁定流复用.
--
-- 旧 CHECK 约束未显式命名,PG 自动给名 auth_audit_log_event_check.
-- 通过 information_schema 自动定位约束名,避开命名假设.

BEGIN;

DO $$
DECLARE
  cn text;
BEGIN
  SELECT con.conname INTO cn
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
   WHERE cls.relname = 'auth_audit_log'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%event%';
  IF cn IS NOT NULL THEN
    EXECUTE format('ALTER TABLE auth_audit_log DROP CONSTRAINT %I', cn);
  END IF;
END $$;

ALTER TABLE auth_audit_log
  ADD CONSTRAINT auth_audit_log_event_check CHECK (event IN (
    'login.success', 'login.failure', 'login.locked',
    'logout', 'password.change', 'password.reset',
    'user.create', 'user.disable',
    'workspace.delete',
    -- 043 新增:
    'meeting.shared',
    'meeting.imported'
  ));

COMMIT;

-- 验证:
-- INSERT INTO auth_audit_log (event, metadata) VALUES ('meeting.imported', '{"sourceMeetingId":"x"}'::jsonb);
-- SELECT count(*) FROM auth_audit_log WHERE event LIKE 'meeting.%';

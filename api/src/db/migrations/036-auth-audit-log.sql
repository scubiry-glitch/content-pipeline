-- 036-auth-audit-log.sql
-- 安全审计日志 + 登录失败计数兼任锁定
--
-- event 取值 (保持枚举开放, 用 CHECK 约束便于初期):
--   login.success      登录成功
--   login.failure      登录失败 (密码错 / 账号停用 / 账号不存在均归入)
--   login.locked       因连续失败被锁
--   logout             显式登出
--   password.change    用户改密
--   password.reset     admin 重置某用户密码
--   user.create        admin 创建账号
--   user.disable       admin 停用账号
--   workspace.delete   ws 被删除 (附带 slug 在 metadata 里)
--
-- 锁定策略 (在 routes/auth.ts login 里用):
--   过去 15 分钟内同 email 的 login.failure ≥ 5 → 拒绝下次登录, 写一条 login.locked
--   30 分钟内不再继续累加 (计算窗口滑动, 自然清零)

BEGIN;

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  email       CITEXT,
  event       TEXT NOT NULL CHECK (event IN (
    'login.success', 'login.failure', 'login.locked',
    'logout', 'password.change', 'password.reset',
    'user.create', 'user.disable',
    'workspace.delete'
  )),
  ip          INET,
  user_agent  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_recent
  ON auth_audit_log(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- 关键索引: 锁定查询会用这个 (按 email + event + 时间窗口)
CREATE INDEX IF NOT EXISTS idx_audit_email_event_recent
  ON auth_audit_log(email, event, created_at DESC) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_event_recent
  ON auth_audit_log(event, created_at DESC);

COMMIT;

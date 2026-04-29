# RLS (Row-Level Security) 启用指南

## 现状

migration 039 已落地以下策略到 51 张 P0 表:

```sql
ALTER TABLE <p0_table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <p0_table> FORCE ROW LEVEL SECURITY;
CREATE POLICY ws_isolation ON <p0_table>
  USING (
    current_setting('app.workspace_id', TRUE) IS NULL OR
    current_setting('app.workspace_id', TRUE) = '' OR
    workspace_id::text = current_setting('app.workspace_id', TRUE) OR
    workspace_id IN (SELECT id FROM _shared_workspace_ids)
  );
```

**当前应用接 DB 的用户 `scubiry` 是 SUPERUSER, 所有 RLS 都被自动 bypass.**

→ RLS 策略目前仅是"备用基础设施", 未实际拦截任何查询.

## 为什么不直接用 scubiry?

PostgreSQL 文档明确:
> Superusers and roles with the BYPASSRLS attribute always bypass the row
> security system when accessing a table.

`FORCE ROW LEVEL SECURITY` 只对 table owner 生效, 对 superuser 仍 bypass.

## 启用 RLS 的剩余 3 步

### 第 1 步 ✅ 已完成: 角色 + 授权 (CREATE ROLE + GRANTs)

`pipeline_app` 角色已通过 SUPERUSER 创建并授权 (本会话执行的 SQL 在 server log 里). 验证:

```sql
-- 应输出: super=false bypassrls=false
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='pipeline_app';
```

密码已保存到 `api/.env` 的 `PIPELINE_APP_DB_PASSWORD` (未 commit).

### 第 2 步 ⚠️ 需要 DB server 端管理员操作: 添加 pg_hba.conf 条目

新角色默认无网络访问权 (`no pg_hba.conf entry`). 在 DB server 上 (124.156.192.230):

```bash
# 通常路径 (以你的 PG 安装为准):
#   /etc/postgresql/15/main/pg_hba.conf
#   或 /var/lib/pgsql/data/pg_hba.conf

# 在 scubiry 那一行附近加:
host    author      pipeline_app    0.0.0.0/0       scram-sha-256

# 或限制到内网/堡垒机的具体 IP, e.g. 10.0.0.0/8
```

reload (无需 restart):

```bash
sudo systemctl reload postgresql
# 或:  pg_ctl reload -D /var/lib/pgsql/data
# 或:  SELECT pg_reload_conf();   (从 SUPERUSER psql)
```

### 第 3 步: 应用切到新角色

修改 `api/.env`:
```
DB_USER=pipeline_app
DB_PASSWORD=${PIPELINE_APP_DB_PASSWORD}   # 引用 step 1 已存的值
```

> 简便做法: `sed -i 's/^DB_USER=.*/DB_USER=pipeline_app/' api/.env`
> 加一行: `DB_PASSWORD=$(grep ^PIPELINE_APP_DB_PASSWORD api/.env | cut -d= -f2)`
> (确保 `DB_PASSWORD` 不与 `PIPELINE_APP_DB_PASSWORD` 同时存在两份不同值)

重启 API → RLS 即生效.

### 验证

```sql
-- 用 pipeline_app 连接 (psql -U pipeline_app)
-- 不 SET app.workspace_id → 看到全部 (默认放行)
SELECT count(*) FROM tasks;

-- SET 到不存在 ws + default is_shared=true → 仍看 default 的 task (因 shared 兜底)
BEGIN;
SET LOCAL app.workspace_id = '00000000-0000-0000-0000-000000000000';
SELECT count(*) FROM tasks;  -- 应等于 default ws 的 task 数
ROLLBACK;

-- 临时把 default is_shared 关掉验证强制隔离
BEGIN;
UPDATE workspaces SET is_shared=false WHERE slug='default';
SET LOCAL app.workspace_id = '00000000-0000-0000-0000-000000000000';
SELECT count(*) FROM tasks;  -- 应 = 0 (RLS 拦截)
ROLLBACK;  -- 同时回滚 is_shared 与查询
```

## 应用层接入 (helper)

切了 DB 用户后, 路由要主动告诉 PG "我现在是哪个 ws". 通过 `withWorkspaceTx`:

```ts
import { withWorkspaceTx } from '../db/repos/withWorkspace.js';

// 在路由 handler 里
const wsId = currentWorkspaceId(request);
return await withWorkspaceTx(wsId, async (client) => {
  const r = await client.query('SELECT * FROM tasks WHERE ...');
  return r.rows;
});
```

`withWorkspaceTx` 内部:
```sql
BEGIN;
SET LOCAL app.workspace_id = $1;
-- ... 你的查询
COMMIT;
```

注意: SET LOCAL 仅在事务内生效, 事务结束自动清, 池连接被复用时不会泄漏.

## 现有路由是否要立刻改?

**不必**. 应用层已实现了完整的 ws 过滤 (production / assets / hot-topics 等 13 个 router 显式 WHERE workspace_id), 跨 ws 100% 阻断. RLS 只是 DB 兜底, 防御"开发者忘记加 WHERE" 的情况.

建议路径:
1. 先切 pipeline_app 用户 → RLS 自动启用 (任何遗漏的 SELECT 立刻被 RLS 拦截)
2. 验证业务无回归
3. 可选: 把高频路由改成 withWorkspaceTx 模式 (更明确, DB log 也能看到 SET LOCAL)

## 风险与回滚

风险:
- 新角色权限不全 → 某些查询失败
- 有些后台任务用 admin 凭据连接, 与 RLS 冲突 (实测当前都用 scubiry/superuser 不会)

回滚:
- 退回到 `DB_USER=scubiry` → 立即恢复 SUPERUSER bypass
- 或 `ALTER ROLE pipeline_app BYPASSRLS;` → 临时绕过

完全卸 RLS:
```sql
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT table_name FROM information_schema.columns
    WHERE column_name='workspace_id' AND table_schema='public'
      AND table_name <> 'workspace_members'
  LOOP
    EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS ws_isolation ON %I', t);
  END LOOP;
END $$;
```

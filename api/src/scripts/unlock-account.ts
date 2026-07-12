/**
 * unlock-account.ts — 清除某邮箱的登录锁(防爆破 30 分钟锁定)。
 * 删掉 auth_audit_log 里最近 35 分钟的 login.locked / login.failure 事件,使 checkEmailLock 立即放行。
 * 用法: npx tsx src/scripts/unlock-account.ts <email> [--apply]
 * 默认 dry-run。仅对本人/授权账号使用;这是删审计事件行的操作。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';
import { checkEmailLock } from '../services/auth/audit.js';

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const email = (args.find((a) => a !== '--apply') || '').trim().toLowerCase();
  if (!email) { console.error('用法: <email> [--apply]'); process.exit(1); }

  const before = await checkEmailLock(email);
  const rows = await query<{ event: string; n: number }>(
    `SELECT event, count(*)::int AS n FROM auth_audit_log
      WHERE email = $1 AND event IN ('login.locked','login.failure')
        AND created_at > NOW() - INTERVAL '35 minutes' GROUP BY event`, [email]);
  console.log(`账号: ${email}`);
  console.log(`  当前锁状态: ${JSON.stringify(before)}`);
  console.log(`  35min 内相关事件: ${JSON.stringify(rows.rows)}`);
  console.log(`  模式: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  if (!apply) { console.log('\n[dry-run] 加 --apply 执行。'); process.exit(0); }

  const del = await query(
    `DELETE FROM auth_audit_log
      WHERE email = $1 AND event IN ('login.locked','login.failure')
        AND created_at > NOW() - INTERVAL '35 minutes'`, [email]);
  const after = await checkEmailLock(email);
  console.log(`\n✓ 删除 ${(del as any).rowCount ?? 0} 行。解锁后状态: ${JSON.stringify(after)}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

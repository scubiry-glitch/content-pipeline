/**
 * reset-user-password.ts — 按邮箱重置某用户的登录密码(bcrypt,与应用同一套 hash)。
 * 用法: npx tsx src/scripts/reset-user-password.ts <email> <新密码> [--apply]
 * 默认 dry-run。--apply 时:更新 users.password_hash,must_change_password=FALSE,并清登录失败锁。
 */
import 'dotenv/config';
import { query } from '../db/connection.js';
import { hashPassword } from '../services/auth/passwords.js';

(async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [emailRaw, password] = args.filter((a) => a !== '--apply');
  if (!emailRaw || !password) { console.error('用法: <email> <新密码> [--apply]'); process.exit(1); }
  const email = emailRaw.trim().toLowerCase();

  const u = await query<{ id: string; email: string; name: string; status: string; must_change_password: boolean; last_login_at: string | null }>(
    `SELECT id, email, name, status, must_change_password, last_login_at FROM users WHERE email = $1`, [email]);
  if (u.rows.length === 0) { console.error(`用户不存在: ${email}`); process.exit(1); }
  const user = u.rows[0];
  console.log(`用户: ${user.name} <${user.email}>  id=${user.id}`);
  console.log(`  status=${user.status}  must_change_password=${user.must_change_password}  last_login=${user.last_login_at ?? '从未'}`);
  console.log(`  新密码: ${'*'.repeat(password.length)} (${password.length} 位)`);
  console.log(`  模式: ${apply ? 'APPLY' : 'DRY-RUN'}`);

  if (!apply) { console.log('\n[dry-run] 加 --apply 执行。'); process.exit(0); }

  const hash = await hashPassword(password);
  await query(`UPDATE users SET password_hash = $1, must_change_password = FALSE, status = 'active', updated_at = NOW() WHERE id = $2`, [hash, user.id]);
  // 清掉可能存在的登录失败锁(表名容错:不存在则跳过)
  for (const t of ['auth_login_attempts', 'login_attempts', 'auth_failed_logins']) {
    await query(`DELETE FROM ${t} WHERE lower(email) = $1`, [email]).catch(() => {});
  }
  console.log('\n✓ 密码已重置。可用新密码登录。');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

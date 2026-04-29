import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const TARGET = '50916a15-8c2e-4400-b296-52eb9e546955';

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});
await client.connect();
try {
  // 1) 目标会议工作区
  const m = await client.query(
    `SELECT a.id, a.title, a.workspace_id, w.slug, w.is_shared
       FROM assets a LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.id = $1`,
    [TARGET],
  );
  console.log('[meeting]', m.rows[0]);

  // 2) admin 最新 session 的 current_workspace_id
  const s = await client.query(
    `SELECT s.current_workspace_id, w.slug, u.email, s.last_seen_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN workspaces w ON w.id = s.current_workspace_id
      WHERE s.revoked_at IS NULL AND s.expires_at > now()
        AND u.email = 'admin@local'
      ORDER BY s.last_seen_at DESC LIMIT 3`,
  );
  console.log('\n[admin active sessions]');
  console.table(s.rows);

  // 3) assertRowInWorkspace(write) 模拟 — 严格匹配
  const wsId = s.rows[0]?.current_workspace_id;
  if (wsId) {
    const w = await client.query(
      `SELECT 1 FROM assets WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [TARGET, wsId],
    );
    console.log(`\n[assertRowInWorkspace mode=write] ws=${wsId.slice(0,8)}…, rows = ${w.rows.length}`);
    console.log(w.rows.length === 0 ? '→ 严格匹配失败 → preHandler 返回 404 ✓ 这是 404 来源' : '→ 严格匹配通过 → 不该 404');
  }
} finally {
  await client.end();
}

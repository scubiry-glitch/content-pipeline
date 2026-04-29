// 完全模拟 admin 当前 session (current_ws=default) 调 GET /meetings 的 SQL, 看返回结果
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

const ADMIN_WS = '61307c1b-f493-45d2-803d-1250ad26c14c'; // default
const TARGET = 'ed0235de-176c-4e42-b6ae-7d4cf636d76f';

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});
await client.connect();
try {
  // 严格按 router.ts:175-252 的 SQL, 限制 limit=50, status='active'
  const r = await client.query(
    `SELECT
       a.id,
       COALESCE(a.title, a.metadata->>'title', 'Untitled') AS title,
       a.metadata->>'meeting_kind' AS meeting_kind,
       COALESCE((a.metadata->>'archived')::boolean, false) AS archived
     FROM assets a
     WHERE (a.type = 'meeting_note' OR (a.metadata ? 'meeting_kind'))
       AND (
         $2::text = 'all'
         OR ($2::text = 'active'   AND COALESCE((a.metadata->>'archived')::boolean, false) = false)
         OR ($2::text = 'archived' AND COALESCE((a.metadata->>'archived')::boolean, false) = true)
       )
       AND (
         $3::uuid IS NULL
         OR a.workspace_id = $3::uuid
         OR a.workspace_id IN (SELECT id FROM workspaces WHERE is_shared)
       )
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [50, 'active', ADMIN_WS],
  );
  console.log(`[admin@local, ws=default] GET /meetings → ${r.rows.length} 条`);
  const found = r.rows.find(row => row.id === TARGET);
  console.log(`目标会议 ${TARGET.slice(0,8)}…  在列表里: ${found ? '✓ YES' : '✗ NO'}`);
  console.log('\n前 15 条:');
  console.table(r.rows.slice(0, 15).map(row => ({
    id: row.id.slice(0, 8) + '…',
    title: (row.title || '').slice(0, 50),
    archived: row.archived,
  })));

  // 如果目标不在列表, 单独查它的状态
  if (!found) {
    const single = await client.query(
      `SELECT a.id, a.type, a.title, a.workspace_id, a.is_deleted, a.is_hidden,
              (a.metadata ? 'meeting_kind') AS has_meeting_kind,
              (a.metadata->>'archived')::boolean AS archived,
              a.metadata->>'meeting_kind' AS meeting_kind
         FROM assets a WHERE a.id = $1`,
      [TARGET],
    );
    console.log(`\n[diagnostic] 目标会议字段:`, single.rows[0]);
  }
} finally {
  await client.end();
}

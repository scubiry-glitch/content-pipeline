// 调查最近 seed 的会议在哪个 workspace 以及 admin 看不到的原因
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const RECENT_IDS = [
  'ed0235de-176c-4e42-b6ae-7d4cf636d76f', // 华泰 × 江苏银行
  '9b114338-63e3-45c7-b386-f5d303674d6e', // 贝壳 × 宁波银行
  '86fb33ff-7185-4484-a656-770ec3f18bb5', // 租赁住房标准
  '439cbb8e',                                // meizu renewal (truncated, will LIKE)
  'db308601',                                // strategy 2026-04-27
  'dade6c66',                                // renovation loan
];

const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
await client.connect();
try {
  console.log('=== Workspaces ===');
  const ws = await client.query(`SELECT id, slug, name, is_shared, created_at FROM workspaces ORDER BY created_at`);
  console.table(ws.rows);

  console.log('\n=== Recent seeded meetings: workspace assignment ===');
  const r = await client.query(
    `SELECT a.id, a.title, a.workspace_id, w.slug AS ws_slug, w.is_shared,
            a.created_at
       FROM assets a
       LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.id IN ($1, $2, $3)
         OR a.id::text LIKE $4
         OR a.id::text LIKE $5
         OR a.id::text LIKE $6
      ORDER BY a.created_at DESC`,
    [
      'ed0235de-176c-4e42-b6ae-7d4cf636d76f',
      '9b114338-63e3-45c7-b386-f5d303674d6e',
      '86fb33ff-7185-4484-a656-770ec3f18bb5',
      '439cbb8e%', 'db308601%', 'dade6c66%',
    ],
  );
  console.table(r.rows);

  console.log('\n=== assets.workspace_id column DEFAULT ===');
  const def = await client.query(
    `SELECT column_default
       FROM information_schema.columns
      WHERE table_schema='public' AND table_name='assets' AND column_name='workspace_id'`,
  );
  console.log(def.rows[0]);

  console.log('\n=== users + workspace memberships ===');
  const u = await client.query(`
    SELECT u.id, u.email,
           array_agg(json_build_object('ws_slug', w.slug, 'role', wm.role) ORDER BY w.slug) AS memberships
      FROM users u
      LEFT JOIN workspace_members wm ON wm.user_id = u.id
      LEFT JOIN workspaces w ON w.id = wm.workspace_id
     GROUP BY u.id, u.email
     ORDER BY u.created_at
  `);
  console.table(u.rows.map(r => ({ ...r, memberships: JSON.stringify(r.memberships) })));
} finally {
  await client.end();
}

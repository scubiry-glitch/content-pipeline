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

const MEETING_ID = 'ed0235de-176c-4e42-b6ae-7d4cf636d76f';

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});
await client.connect();
try {
  // 1) 会议基础属性: 哪个 ws / 是否有 created_by 字段
  const r = await client.query(
    `SELECT a.id, a.title, a.workspace_id, w.slug AS ws_slug, w.name AS ws_name, w.is_shared,
            a.created_at,
            -- assets 表的常见 owner 列
            (SELECT column_name FROM information_schema.columns
              WHERE table_schema='public' AND table_name='assets'
                AND column_name IN ('created_by','user_id','owner_id','author_id') LIMIT 1) AS owner_col
       FROM assets a
       LEFT JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.id = $1`,
    [MEETING_ID],
  );
  console.log('=== 会议基本信息 ===');
  console.log(r.rows[0]);

  // 2) 列出 assets 表所有列, 看哪些"可能"指向 user
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='assets'
      ORDER BY ordinal_position`,
  );
  console.log('\n=== assets 表列 ===');
  console.log(cols.rows.map(r => r.column_name).join(', '));

  // 3) workspace_members: 这个 ws 的所有成员
  const ws = r.rows[0]?.workspace_id;
  if (ws) {
    const m = await client.query(
      `SELECT u.email, wm.role
         FROM workspace_members wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
        ORDER BY wm.role, u.email`,
      [ws],
    );
    console.log(`\n=== ws=${r.rows[0].ws_slug} (${ws.slice(0,8)}…) 的成员 ===`);
    console.table(m.rows);
  }
} finally {
  await client.end();
}

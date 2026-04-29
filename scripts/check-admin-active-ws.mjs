// 看 admin 当前激活的 workspace 是哪个 (找最近 session)
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

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});
await client.connect();
try {
  // 看认证相关的所有表
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND (table_name LIKE '%session%' OR table_name LIKE '%auth%'
             OR table_name LIKE '%user%' OR table_name = 'workspaces' OR table_name = 'workspace_members')
      ORDER BY table_name`,
  );
  console.log('=== auth-related tables ===');
  console.log(tables.rows.map(r => r.table_name).join(', '));

  // sessions 表的结构
  const sessTbl = tables.rows.find(r => r.table_name.includes('session'));
  if (sessTbl) {
    const cols = await client.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position`,
      [sessTbl.table_name],
    );
    console.log(`\n=== ${sessTbl.table_name} 列 ===`);
    console.log(cols.rows.map(r => `${r.column_name}(${r.data_type})`).join(', '));

    // 取最近 session
    const recent = await client.query(`SELECT * FROM ${sessTbl.table_name} ORDER BY created_at DESC LIMIT 5`);
    console.log(`\n=== 最近 5 条 session ===`);
    console.log(recent.rows);
  }
} finally {
  await client.end();
}

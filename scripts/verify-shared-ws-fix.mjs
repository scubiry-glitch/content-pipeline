// 验证修复: 模拟 admin 当前在 phase2-iso3 workspace, 看是否能查到 default workspace 的 seed 会议
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

const PHASE2_WS = '877c9caf-f125-4dfa-a2a6-7e1ce3d046e6';
const HUATAI_MEETING = 'ed0235de-176c-4e42-b6ae-7d4cf636d76f';

const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
await client.connect();
try {
  // 1) 旧 SQL (修复前): 严格 workspace_id 匹配 — 应该看不到 default 的会议
  const oldQuery = await client.query(
    `SELECT id, title FROM assets
      WHERE id = $1 AND workspace_id = $2`,
    [HUATAI_MEETING, PHASE2_WS],
  );
  console.log('[BEFORE fix] strict ws filter, rows =', oldQuery.rows.length);

  // 2) 新 SQL (修复后): 加 OR is_shared 兜底 — 应该看到 default 的会议
  const newQuery = await client.query(
    `SELECT id, title FROM assets
      WHERE id = $1
        AND (workspace_id = $2 OR workspace_id IN (SELECT id FROM workspaces WHERE is_shared))`,
    [HUATAI_MEETING, PHASE2_WS],
  );
  console.log('[AFTER fix]  read clause, rows =', newQuery.rows.length);
  if (newQuery.rows.length > 0) console.log('  →', newQuery.rows[0]);

  // 3) 列表层验证: 模拟 GET /meetings (admin 在 phase2-iso3)
  const listQuery = await client.query(
    `SELECT a.id, COALESCE(a.title, 'Untitled') AS title, a.workspace_id
       FROM assets a
      WHERE (a.type = 'meeting_note' OR (a.metadata ? 'meeting_kind'))
        AND COALESCE((a.metadata->>'archived')::boolean, false) = false
        AND (
          $1::uuid IS NULL
          OR a.workspace_id = $1::uuid
          OR a.workspace_id IN (SELECT id FROM workspaces WHERE is_shared)
        )
      ORDER BY a.created_at DESC
      LIMIT 10`,
    [PHASE2_WS],
  );
  console.log(`\n[list query] admin (ws=phase2-iso3) — top ${listQuery.rows.length} meetings visible:`);
  console.table(listQuery.rows.map(r => ({ id: r.id.slice(0, 8) + '…', title: r.title.slice(0, 50), ws: r.workspace_id.slice(0, 8) })));

  // 4) 写入验证: assertRowInWorkspace(mode='write') — 应该看不到 (跨 ws 写仍拦截)
  const writeCheck = await client.query(
    `SELECT 1 FROM assets WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [HUATAI_MEETING, PHASE2_WS],
  );
  console.log('\n[write authz] assertRowInWorkspace(mode=write), rows =', writeCheck.rows.length, '(应该 = 0, 跨 ws 不允许写)');
} finally {
  await client.end();
}

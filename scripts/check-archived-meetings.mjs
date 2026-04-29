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
  const r = await client.query(
    `SELECT id, title,
            (metadata->>'archived')::boolean AS archived,
            metadata->>'archived_at' AS archived_at,
            metadata->>'archived_by' AS archived_by,
            created_at
       FROM assets
      WHERE type = 'meeting_note'
        AND (metadata->>'archived')::boolean = TRUE
      ORDER BY created_at DESC`,
  );
  console.log(`[archived meetings] count = ${r.rows.length}`);
  console.table(r.rows.map(x => ({
    id: x.id.slice(0,8) + '…',
    title: (x.title || '').slice(0, 50),
    archived_at: x.archived_at,
    archived_by: x.archived_by,
    created_at: x.created_at,
  })));
} finally {
  await client.end();
}

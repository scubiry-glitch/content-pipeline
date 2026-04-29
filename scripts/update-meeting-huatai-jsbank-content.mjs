// 把 docx 转写正文补到已存在的华泰会议记录
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import mammoth from 'mammoth';
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

const MEETING_ID = 'ed0235de-176c-4e42-b6ae-7d4cf636d76f';
const DOCX = '/Users/scubiry/Downloads/华泰证券与江苏银行私募份额质押.docx';

const { value: rawText } = await mammoth.extractRawText({ path: DOCX });
const transcript = rawText.replace(/\r\n/g, '\n').trim();
console.log(`[update] extracted ${transcript.length} chars from docx (${transcript.split('\n').length} lines)`);

const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});
await client.connect();
try {
  const u = await client.query(
    `UPDATE assets
        SET content = $2,
            metadata = jsonb_set(metadata, '{source_filename}', '"华泰证券与江苏银行私募份额质押.docx"'::jsonb, true)
      WHERE id = $1`,
    [MEETING_ID, transcript],
  );
  console.log(`[update] rows affected: ${u.rowCount}`);

  const r = await client.query(
    `SELECT id, title, length(content) AS content_chars,
            metadata->>'source_filename' AS source_filename
       FROM assets WHERE id = $1`,
    [MEETING_ID],
  );
  console.log('[update] verify:', r.rows[0]);
  console.log(`\n[update] open: http://localhost:5173/meeting/${MEETING_ID}/a`);
} finally {
  await client.end();
}

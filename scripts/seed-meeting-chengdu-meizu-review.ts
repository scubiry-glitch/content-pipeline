import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const ANALYSIS_FILE = '/Users/scubiry/Downloads/chengdu-meizu-review__analysis.ts';
const TRANSCRIPT_FILE = '/Users/scubiry/Downloads/成都美租.txt';

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

const imported = await import(pathToFileURL(ANALYSIS_FILE).href);
const MEETING = imported.MEETING ?? {};
const PARTICIPANTS = imported.PARTICIPANTS ?? [];
const ANALYSIS = imported.ANALYSIS ?? {};
const APRIL_SNAPSHOT = imported.APRIL_SNAPSHOT ?? null;
const PROFIT_SHARING_EVOLUTION = imported.PROFIT_SHARING_EVOLUTION ?? null;
const STUCK_POINT_FRAMEWORK = imported.STUCK_POINT_FRAMEWORK ?? null;
const META = imported.META ?? null;

const transcript = readFileSync(TRANSCRIPT_FILE, 'utf8').replace(/\r\n/g, '\n').trim();
const NEW_MEETING_ID = randomUUID();
const TITLE = MEETING.title ?? '成都美租 · 业务复盘会';

const occurredAt = (() => {
  const date = typeof MEETING.date === 'string' ? MEETING.date : '2026-04-30';
  const time = typeof MEETING.time === 'string' ? MEETING.time : '14:21';
  return `${date}T${time}:00+08:00`;
})();

const metadata = {
  occurred_at: occurredAt,
  meeting_kind: 'business_review',
  duration_label: MEETING.duration ?? null,
  room: MEETING.room ?? null,
  source_note: MEETING.source ?? '会议自动转写',
  source_filename: '成都美租.txt',
  off_topic_pct: typeof MEETING.offTopicPct === 'number' ? MEETING.offTopicPct : 0,
  tokens_estimate: MEETING.tokens ?? null,
  participants: PARTICIPANTS,
  analysis: ANALYSIS,
  april_snapshot: APRIL_SNAPSHOT,
  profit_sharing_evolution: PROFIT_SHARING_EVOLUTION,
  stuck_point_framework: STUCK_POINT_FRAMEWORK,
  meta: META,
  imported_from: {
    analysis_file: ANALYSIS_FILE,
    transcript_file: TRANSCRIPT_FILE,
  },
};

const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

await client.connect();
try {
  await client.query(
    `INSERT INTO assets (id, type, title, content, content_type, metadata)
     VALUES ($1, 'meeting_note', $2, $3, 'meeting_note', $4::jsonb)`,
    [NEW_MEETING_ID, TITLE, transcript, JSON.stringify(metadata)],
  );

  const verify = await client.query(
    `SELECT id, title, type, length(content) AS content_chars,
            jsonb_array_length(COALESCE(metadata->'participants', '[]'::jsonb)) AS n_participants,
            jsonb_typeof(metadata->'analysis') AS analysis_type,
            metadata->>'occurred_at' AS occurred_at
       FROM assets
      WHERE id = $1`,
    [NEW_MEETING_ID],
  );

  console.log('[seed] verify:', verify.rows[0]);
  console.log(`[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}

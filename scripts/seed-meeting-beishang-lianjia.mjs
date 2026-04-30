// Seed · 北上链家业务经营分析与预算规划 — 新建会议
// 分析: /Users/scubiry/Downloads/meeting_analysis.json (整份直接 embed)
// 转写源: /Users/scubiry/Downloads/北上链家业务经营分析与预算规划.txt
//
// 用法: node scripts/seed-meeting-beishang-lianjia.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const NEW_MEETING_ID = randomUUID();

const ANALYSIS_PATH = '/Users/scubiry/Downloads/meeting_analysis.json';
const TRANSCRIPT_PATH = '/Users/scubiry/Downloads/北上链家业务经营分析与预算规划.txt';

const raw = JSON.parse(readFileSync(ANALYSIS_PATH, 'utf8'));
const TRANSCRIPT = readFileSync(TRANSCRIPT_PATH, 'utf8').replace(/\r\n/g, '\n').trim();

const TITLE = raw.meeting?.title || '北上链家业务经营分析与预算规划';
const date = raw.meeting?.date || '2026-03-04';
// JSON 里只有日期, 没具体时间; 用日期 + 默认 09:00+08:00
const OCCURRED_AT = `${date}T09:00:00+08:00`;

// duration "54:22" → 54.367 分钟
const durStr = raw.meeting?.duration || '54:22';
const [mm, ss] = durStr.split(':').map(Number);
const durationMin = (mm || 0) + (ss || 0) / 60;

const metadata = {
  occurred_at: OCCURRED_AT,
  meeting_kind: 'business_review',
  duration_min: durationMin,
  duration_label: durStr,
  room: raw.meeting?.room || null,
  source_note: '会议自动转写',
  source_filename: '北上链家业务经营分析与预算规划.txt',
  off_topic_pct: 0.0,
  tokens_estimate: raw.meeting?.tokens || null,
  participants: raw.participants,
  analysis: raw.analysis,
  axes: raw.axes,
  facts: raw.facts,
  wiki_markdown: raw.wikiMarkdown,
};

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});
await client.connect();
try {
  await client.query(
    `INSERT INTO assets (id, type, title, content, content_type, metadata)
     VALUES ($1, 'meeting_note', $2, $3, 'meeting_note', $4::jsonb)`,
    [NEW_MEETING_ID, TITLE, TRANSCRIPT, JSON.stringify(metadata)],
  );
  console.log(`[seed] INSERTed new meeting ${NEW_MEETING_ID}`);

  const r = await client.query(
    `SELECT id, title, type,
            length(content) AS content_chars,
            metadata->>'occurred_at'  AS occurred_at,
            jsonb_array_length(COALESCE((metadata->'participants'), '[]'::jsonb))            AS n_participants,
            jsonb_typeof(metadata->'analysis')                                                AS analysis_typeof,
            jsonb_array_length(COALESCE((metadata->'analysis'->'tension'), '[]'::jsonb))      AS n_tensions,
            jsonb_array_length(COALESCE((metadata->'analysis'->'newCognition'), '[]'::jsonb)) AS n_new_cognition,
            jsonb_array_length(COALESCE((metadata->'analysis'->'consensus'), '[]'::jsonb))    AS n_consensus,
            jsonb_array_length(COALESCE((metadata->'analysis'->'crossView'), '[]'::jsonb))    AS n_cross_view,
            jsonb_typeof(metadata->'axes')                                                    AS axes_typeof,
            jsonb_array_length(COALESCE((metadata->'axes'->'knowledge'->'reusableJudgments'), '[]'::jsonb)) AS n_judgments,
            jsonb_array_length(COALESCE((metadata->'axes'->'knowledge'->'mentalModels'), '[]'::jsonb))      AS n_mental_models,
            jsonb_array_length(COALESCE((metadata->'axes'->'projects'->'decisionChain'), '[]'::jsonb))      AS n_decisions,
            jsonb_array_length(COALESCE((metadata->'axes'->'projects'->'assumptions'), '[]'::jsonb))        AS n_assumptions
       FROM assets WHERE id = $1`,
    [NEW_MEETING_ID],
  );
  console.log('[seed] verify:', r.rows[0]);
  console.log(`\n[seed] open: http://localhost:5173/meeting/${NEW_MEETING_ID}/a`);
} finally {
  await client.end();
}

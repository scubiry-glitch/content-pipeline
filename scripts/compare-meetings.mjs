#!/usr/bin/env node
// 对比两个 meeting 的生成质量（claude-cli 模式 vs multi-axis 模式）
// 用法: node scripts/compare-meetings.mjs <meetingId-A> <meetingId-B>

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const pool = new pg.Pool({
  host: env.DB_HOST, port: parseInt(env.DB_PORT ?? '5432', 10),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});

const [aId, bId] = process.argv.slice(2);
if (!aId || !bId) { console.error('Usage: compare-meetings.mjs <id-A> <id-B>'); process.exit(1); }

const TABLES = [
  'mn_commitments', 'mn_decisions', 'mn_assumptions', 'mn_open_questions', 'mn_risks',
  'mn_judgments', 'mn_mental_model_invocations', 'mn_evidence_grades', 'mn_cognitive_biases',
  'mn_counterfactuals', 'mn_decision_quality', 'mn_meeting_necessity', 'mn_affect_curve',
  'mn_speech_quality', 'mn_silence_signals', 'mn_role_trajectory_points',
  'mn_tensions', 'mn_consensus_items', 'mn_focus_map',
];

async function meta(id) {
  const r = await pool.query(`
    SELECT id::text,
           COALESCE(title, metadata->>'title') AS title,
           metadata->'_generated'->>'by' AS gen_by,
           metadata->'_generated'->>'runId' AS run_id,
           metadata->'_generated'->>'at' AS gen_at,
           metadata->'analysis'->>'date' AS date,
           jsonb_array_length(COALESCE(metadata->'analysis'->'participants', '[]'::jsonb)) AS n_participants,
           jsonb_array_length(COALESCE(metadata->'analysis'->'tension', '[]'::jsonb)) AS n_tension,
           jsonb_array_length(COALESCE(metadata->'analysis'->'newCognition', '[]'::jsonb)) AS n_cognition,
           jsonb_array_length(COALESCE(metadata->'analysis'->'consensus', '[]'::jsonb)) AS n_consensus,
           jsonb_array_length(COALESCE(metadata->'analysis'->'focusMap', '[]'::jsonb)) AS n_focus,
           jsonb_array_length(COALESCE(metadata->'analysis'->'crossView', '[]'::jsonb)) AS n_crossview,
           length(metadata->>'analysis')::int AS analysis_chars,
           metadata->'analysis'->>'summary' AS summary,
           metadata->'analysis'->'tension' AS tension_arr
      FROM assets WHERE id = $1
  `, [id]);
  return r.rows[0];
}

function tensionStats(tArr) {
  if (!Array.isArray(tArr) || tArr.length === 0) return { avgMoments: 0, avgSummaryLen: 0, withMoments4plus: 0, withSummary250plus: 0 };
  let mTot = 0, sTot = 0, m4 = 0, s250 = 0;
  for (const t of tArr) {
    const m = Array.isArray(t?.moments) ? t.moments.length : 0;
    const s = String(t?.summary ?? '').length;
    mTot += m; sTot += s;
    if (m >= 4) m4 += 1;
    if (s >= 250) s250 += 1;
  }
  return {
    avgMoments: tArr.length ? +(mTot / tArr.length).toFixed(1) : 0,
    avgSummaryLen: tArr.length ? Math.round(sTot / tArr.length) : 0,
    withMoments4plus: m4, withSummary250plus: s250,
  };
}

// 不同表用不同的 meeting 关联列
const MEETING_COL = {
  mn_open_questions: 'first_raised_meeting_id',
  mn_risks: null,                          // 仅 scope_id 维度，没有 meeting_id；跳过
  mn_judgments: 'abstracted_from_meeting_id',
};

async function tableCount(table, id) {
  const col = MEETING_COL[table] === undefined ? 'meeting_id' : MEETING_COL[table];
  if (col === null) return [{ source: '(scope-level only)', n: 0 }];
  try {
    const r = await pool.query(
      `SELECT COALESCE(source, '(null)') AS source, COUNT(*)::int AS n FROM ${table} WHERE ${col} = $1 GROUP BY source`,
      [id],
    );
    return r.rows;
  } catch (e) {
    return [{ source: 'ERR', n: -1, err: String(e.message ?? '').slice(0, 60) }];
  }
}

async function runHistory(id) {
  const r = await pool.query(`
    SELECT id, axis, state, metadata->>'mode' AS mode, metadata->'expertRoles' AS expert_roles,
           metadata->'strategySpec'->>'preset' AS preset, created_at
      FROM mn_runs WHERE scope_kind = 'meeting' AND scope_id::text = $1
     ORDER BY created_at DESC LIMIT 5
  `, [id]);
  return r.rows;
}

async function sampleAxisRow(table, id) {
  try {
    const r = await pool.query(`SELECT * FROM ${table} WHERE meeting_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT 1`, [id]);
    return r.rows[0];
  } catch { return null; }
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

async function main() {
  const a = await meta(aId);
  const b = await meta(bId);
  if (!a || !b) { console.error('one of the meetings not found'); process.exit(1); }

  console.log(bold(`A · ${aId.slice(0,8)}…`), dim(a.title));
  console.log(bold(`B · ${bId.slice(0,8)}…`), dim(b.title));
  console.log();

  console.log(bold('=== metadata.analysis 顶层字段 ==='));
  const fields = [
    ['_generated.by',  a.gen_by ?? '(null)',         b.gen_by ?? '(null)'],
    ['_generated.at',  a.gen_at ?? '—',              b.gen_at ?? '—'],
    ['date',           a.date ?? '—',                b.date ?? '—'],
    ['analysis size',  `${a.analysis_chars ?? 0} ch`, `${b.analysis_chars ?? 0} ch`],
    ['participants',   a.n_participants,              b.n_participants],
    ['tension',        a.n_tension,                   b.n_tension],
    ['newCognition',   a.n_cognition,                 b.n_cognition],
    ['consensus',      a.n_consensus,                 b.n_consensus],
    ['focusMap',       a.n_focus,                     b.n_focus],
    ['crossView',      a.n_crossview,                 b.n_crossview],
  ];
  console.log('  ' + 'field'.padEnd(20) + 'A'.padEnd(30) + 'B');
  for (const [f, av, bv] of fields) {
    console.log('  ' + f.padEnd(20) + String(av).padEnd(30) + String(bv));
  }

  // KPI · 用 OUTPUT DISCIPLINE 的硬性最低值评分 ─────────────────────────
  console.log();
  console.log(bold('=== KPI · 对照 OUTPUT DISCIPLINE 最低值 ==='));
  const aTs = tensionStats(a.tension_arr);
  const bTs = tensionStats(b.tension_arr);
  const target = { tension: 5, moments: 4, summaryLen: 250, cognition: 6, consensus: 10, crossView: 4 };
  const ck = (cur, min) => (cur >= min ? '✓' : '✗');
  const fmt = (label, av, bv, min) => '  ' + label.padEnd(28) + `${ck(av,min)} ${String(av).padEnd(8)}` + `${ck(bv,min)} ${String(bv).padEnd(8)}` + dim(`(min ${min})`);
  console.log('  ' + 'metric'.padEnd(28) + 'A'.padEnd(11) + 'B'.padEnd(11) + 'target');
  console.log(fmt('tension count',           a.n_tension,         b.n_tension,         target.tension));
  console.log(fmt('avg moments / tension',   aTs.avgMoments,      bTs.avgMoments,      target.moments));
  console.log(fmt('avg summary chars',       aTs.avgSummaryLen,   bTs.avgSummaryLen,   target.summaryLen));
  console.log(fmt('newCognition count',      a.n_cognition,       b.n_cognition,       target.cognition));
  console.log(fmt('consensus count',         a.n_consensus,       b.n_consensus,       target.consensus));
  console.log(fmt('crossView count',         a.n_crossview,       b.n_crossview,       target.crossView));

  console.log();
  console.log(bold('=== mn_* 表 (按 source) ==='));
  console.log('  ' + 'table'.padEnd(34) + 'A'.padEnd(40) + 'B');
  for (const t of TABLES) {
    const aRows = await tableCount(t, aId);
    const bRows = await tableCount(t, bId);
    const aStr = aRows.map(r => `${r.source}=${r.n}`).join(' ') || '0';
    const bStr = bRows.map(r => `${r.source}=${r.n}`).join(' ') || '0';
    console.log('  ' + t.padEnd(34) + aStr.padEnd(40) + bStr);
  }

  console.log();
  console.log(bold('=== run history ==='));
  const aRuns = await runHistory(aId);
  const bRuns = await runHistory(bId);
  console.log('A:');
  for (const r of aRuns) console.log(`  ${r.id.slice(0,8)} · ${r.state.padEnd(10)} · mode=${r.mode ?? 'multi-axis'} · axis=${r.axis} · preset=${r.preset ?? '—'} · expertRoles=${r.expert_roles ? 'set' : 'null'}`);
  console.log('B:');
  for (const r of bRuns) console.log(`  ${r.id.slice(0,8)} · ${r.state.padEnd(10)} · mode=${r.mode ?? 'multi-axis'} · axis=${r.axis} · preset=${r.preset ?? '—'} · expertRoles=${r.expert_roles ? 'set' : 'null'}`);

  console.log();
  console.log(bold('=== summary 文本对比 ==='));
  console.log('A summary:');
  console.log('  ' + (a.summary ?? '(null)').slice(0, 500).replace(/\n/g, '\n  '));
  console.log('B summary:');
  console.log('  ' + (b.summary ?? '(null)').slice(0, 500).replace(/\n/g, '\n  '));

  console.log();
  console.log(bold('=== 一条 cognitive_bias 取样 ==='));
  const aB = await sampleAxisRow('mn_cognitive_biases', aId);
  const bB = await sampleAxisRow('mn_cognitive_biases', bId);
  console.log('A:', aB ? `${aB.bias_type} · severity=${aB.severity} · ${String(aB.where_excerpt ?? '').slice(0,100)}` : '(none)');
  console.log('B:', bB ? `${bB.bias_type} · severity=${bB.severity} · ${String(bB.where_excerpt ?? '').slice(0,100)}` : '(none)');

  console.log();
  console.log(bold('=== 一条 tension 取样 ==='));
  const aT = await sampleAxisRow('mn_tensions', aId);
  const bT = await sampleAxisRow('mn_tensions', bId);
  console.log('A:', aT ? `${aT.topic} · intensity=${aT.intensity} · ${String(aT.summary ?? '').slice(0,150)}` : '(none)');
  console.log('B:', bT ? `${bT.topic} · intensity=${bT.intensity} · ${String(bT.summary ?? '').slice(0,150)}` : '(none)');

  await pool.end();
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });

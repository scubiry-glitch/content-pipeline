#!/usr/bin/env node
// 直接调 MeetingAxesGenerator + MeetingScopeGenerator 写 axes/ + scopes/
// 不走 claude-cli run, 用现有 mn_* 数据 (4000+ rows) 跑.
//
// 用法: node scripts/run-meeting-generators.mjs [--axes] [--scopes] [--all (default)]

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const argv = process.argv.slice(2);
const RUN_AXES = argv.includes('--axes') || argv.includes('--all') || argv.length === 0 || (!argv.includes('--scopes') && !argv.includes('--axes'));
const RUN_SCOPES = argv.includes('--scopes') || argv.includes('--all') || argv.length === 0 || (!argv.includes('--scopes') && !argv.includes('--axes'));

// load env
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const wikiRoot = process.env.MN_CLAUDE_WIKI_ROOT
  || resolve(repoRoot, 'data/content-wiki/default');

console.log(`wikiRoot: ${wikiRoot}`);
console.log(`axes: ${RUN_AXES} · scopes: ${RUN_SCOPES}\n`);

import pg from 'pg';
const pool = new pg.Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT ?? '5432', 10),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

// 包装成 deps 形态
const deps = { db: pool };

async function main() {
  if (RUN_AXES) {
    console.log('=== MeetingAxesGenerator ===');
    const { MeetingAxesGenerator } = await import('../api/src/modules/meeting-notes/wiki/meetingAxesGenerator.ts');
    const gen = new MeetingAxesGenerator(deps);
    const r = await gen.generate({ wikiRoot, limitPerAxis: 200 });
    console.log(`  files written: ${r.filesWritten}`);
    console.log(`  durationMs: ${r.durationMs}`);
    console.log(`  axes summary:`, JSON.stringify(r.axes, null, 2));
    if (r.errors.length > 0) console.log(`  errors:`, r.errors);
    console.log();
  }

  if (RUN_SCOPES) {
    console.log('=== MeetingScopeGenerator ===');
    const { MeetingScopeGenerator } = await import('../api/src/modules/meeting-notes/wiki/meetingScopeGenerator.ts');
    const gen = new MeetingScopeGenerator(deps);
    const r = await gen.generate({ wikiRoot, limitPerAxis: 100 });
    console.log(`  files written: ${r.filesWritten}`);
    console.log(`  durationMs: ${r.durationMs}`);
    console.log(`  scopes:`, r.scopes);
    if (r.errors.length > 0) console.log(`  errors:`, r.errors);
    console.log();
  }

  await pool.end();
}

main().catch((e) => { console.error('fatal:', e); pool.end(); process.exit(1); });

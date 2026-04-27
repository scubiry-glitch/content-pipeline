#!/usr/bin/env node
// Backfill · 给所有历史 meeting 跑一次 claude-cli 模式，初始化 content_facts + wiki .md
//
// 用法:
//   node scripts/backfill-claude-wiki.mjs                 # 跑所有还没 claudeSession 的 meeting
//   node scripts/backfill-claude-wiki.mjs --limit 5       # 限 5 场
//   node scripts/backfill-claude-wiki.mjs --dry-run       # 只列出不真跑
//   node scripts/backfill-claude-wiki.mjs --force         # 包含已经跑过 claude-cli 的 (重跑会更新 cache)
//   node scripts/backfill-claude-wiki.mjs --meeting <id>  # 单场跑
//
// 行为:
//   1. SELECT assets type='meeting_note' AND metadata.analysis 已存在
//   2. 默认排除 metadata.claudeSession 已经存在的 (--force 关闭这条过滤)
//   3. 对每场 POST /api/v1/meeting-notes/runs body={mode:'claude-cli', scope:{kind:'meeting',id}}
//   4. 入队后 console.log runId，不等结果（RunQueue 自己串行）
//   5. 全部入队完毕，提示用户用 GET /runs?scopeKind=meeting&scopeId=... 查状态
//
// 设计：纯入队脚本。不跑 claude（让 api 进程的 RunQueue 跑），所以脚本秒退。
//      RunEngine 默认 concurrency=2，会按入队顺序两两并发跑。
//      claude-cli 一场约 4-5 分钟，30 场预计 ~1 小时跑完。

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

// ── argv 解析 ──
const argv = process.argv.slice(2);
const args = {
  limit: null,
  dryRun: false,
  force: false,
  meetingId: null,
  apiBase: process.env.API_BASE ?? 'http://localhost:3006/api/v1/meeting-notes',
  apiKey: process.env.ADMIN_API_KEY ?? env.ADMIN_API_KEY ?? 'dev-api-key',
};
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
  else if (argv[i] === '--dry-run') args.dryRun = true;
  else if (argv[i] === '--force') args.force = true;
  else if (argv[i] === '--meeting') args.meetingId = argv[++i];
  else if (argv[i] === '--api-base') args.apiBase = argv[++i];
  else if (argv[i] === '--help' || argv[i] === '-h') {
    console.log(readFileSync(__filename, 'utf8').match(/^\/\/[\s\S]*?(?=\nimport)/)?.[0] ?? 'see source');
    process.exit(0);
  }
}

// ── DB 连接 ──
const dbConfig = {
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT ?? '5432', 10),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
};
const pool = new pg.Pool(dbConfig);

async function listCandidates() {
  const filterClause = args.force
    ? `metadata ? 'analysis'`
    : `metadata ? 'analysis' AND NOT (metadata ? 'claudeSession')`;
  const meetingClause = args.meetingId
    ? `AND id::text = $1`
    : '';
  const limitClause = args.limit ? `LIMIT ${parseInt(args.limit, 10)}` : '';

  const sql = `
    SELECT id::text AS id,
           COALESCE(title, metadata->>'title', '(untitled)') AS title,
           created_at,
           metadata ? 'claudeSession' AS already_claude_cli,
           metadata ? 'analysis' AS has_analysis
      FROM assets
     WHERE (type = 'meeting_note' OR (metadata ? 'meeting_kind'))
       AND COALESCE((metadata->>'archived')::boolean, false) = false
       AND ${filterClause}
       ${meetingClause}
     ORDER BY created_at DESC
     ${limitClause}
  `;
  const params = args.meetingId ? [args.meetingId] : [];
  const r = await pool.query(sql, params);
  return r.rows;
}

async function enqueueRun(meetingId) {
  const url = `${args.apiBase}/runs`;
  const body = {
    scope: { kind: 'meeting', id: meetingId },
    axis: 'all',
    preset: 'standard',
    triggeredBy: 'manual',
    mode: 'claude-cli',
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': args.apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /runs ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

async function main() {
  console.log('[backfill] config:', {
    apiBase: args.apiBase,
    limit: args.limit ?? '(all)',
    dryRun: args.dryRun,
    force: args.force,
    meetingId: args.meetingId,
  });

  const candidates = await listCandidates();
  console.log(`[backfill] 候选 meeting 数: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('[backfill] 没有满足条件的 meeting (要么 metadata.analysis 不存在, 要么已经跑过 claude-cli, 加 --force 包含后者)');
    await pool.end();
    return;
  }

  console.log('\n[backfill] 候选清单:');
  for (const c of candidates) {
    const flag = c.already_claude_cli ? '[已跑]' : '[新建]';
    console.log(`  ${flag} ${c.id.slice(0, 8)}.. · ${c.title.slice(0, 60)}`);
  }

  if (args.dryRun) {
    console.log('\n[backfill] --dry-run, 退出');
    await pool.end();
    return;
  }

  console.log('\n[backfill] 开始入队...');
  const results = [];
  for (const c of candidates) {
    try {
      const r = await enqueueRun(c.id);
      console.log(`  ✓ ${c.id.slice(0, 8)}.. → runId ${r.runId?.slice(0, 8) ?? 'n/a'}..`);
      results.push({ meetingId: c.id, runId: r.runId, ok: r.ok });
    } catch (e) {
      console.error(`  ✗ ${c.id.slice(0, 8)}.. failed:`, e.message);
      results.push({ meetingId: c.id, runId: null, ok: false, error: e.message });
    }
    // 入队不堵但留 200ms 让 api 喘口气
    await new Promise((r) => setTimeout(r, 200));
  }

  const enqueued = results.filter((x) => x.ok).length;
  const failed = results.filter((x) => !x.ok).length;
  console.log(`\n[backfill] 入队完成: 成功 ${enqueued} · 失败 ${failed}`);
  console.log('[backfill] 状态查询: GET /api/v1/meeting-notes/runs?scopeKind=meeting&scopeId=<id>');
  console.log('[backfill] 或: SELECT id, state, progress_pct, metadata->>\'currentStep\' FROM mn_runs ORDER BY created_at DESC LIMIT 20;');
  console.log(`[backfill] claude-cli 一场约 4-5 分钟，预计 ~${Math.ceil(enqueued * 4.5 / 2)} 分钟跑完 (concurrency=2)`);

  await pool.end();
}

main().catch((e) => {
  console.error('[backfill] fatal:', e);
  process.exit(1);
});

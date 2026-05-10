// scripts/nightly-claude-cli-fallback.mjs — claude-cli 解析失败的存量会议自动以 api-oneshot 重跑
//
// 背景：commit 0041c079（feat: claude-cli inner JSON 失败的四层自救）实现了运行时自动 fallback：
// 同 scope 24h 内 claude-cli 因 inner JSON 失败 ≥2 次 → 自动入队 api-oneshot。
// 但仅对 commit 部署后新失败的 run 生效。本脚本扫历史存量（部署前 / 单次失败未触发 P2 / 远程 worker
// 未及时重启等情况），把符合条件的会议以 api-oneshot 重跑一遍。
//
// 默认匹配条件：
//   1. 最新 run state='failed'
//   2. 最新 run mode='claude-cli'
//   3. 错误信息匹配 'inner JSON.parse failed' 或 'output malformed'
//   4. 该 run.metadata.fallback IS NULL（P2 没触发过）
//   5. 同 scope 没有 queued/running 的 api-oneshot run（去重）
//   6. 同 scope 最近 24h 没有 succeeded 的 api-oneshot run（去重）
//
// 用法：
//   node scripts/nightly-claude-cli-fallback.mjs [--dry-run] [--limit N] [--max-age-days N]
//
// cron 示例（远程 worker 上运行；与 worker 同库）：
//   0 3 * * * cd /proweb/run/pipeline && /root/.nvm/versions/node/v22.22.0/bin/node \
//     scripts/nightly-claude-cli-fallback.mjs --limit 30 >> /tmp/nightly-fallback.log 2>&1

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

// --- 解析参数 ---
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
function intArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Math.max(1, Number(args[i + 1])) : def;
}
const limit = intArg('--limit', 30);
const maxAgeDays = intArg('--max-age-days', 7);

// --- 读 api/.env ---
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const apiBase = env.PUBLIC_API_BASE_URL || env.API_BASE_URL || 'http://paper.morning.rocks';
const apiKey = env.ADMIN_API_KEY || 'dev-api-key-change-in-production';

const client = new pg.Client({
  host: env.DB_HOST, port: Number(env.DB_PORT ?? 5432),
  database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD,
});

await client.connect();
try {
  // 找出符合条件的会议 + 它们最新的失败 run
  // - 用 LATERAL 取 per-meeting 最新 run（按 finished_at DESC）
  // - 同 scope 是否已有 queued/running/最近成功的 api-oneshot run 用 NOT EXISTS 排除
  const sql = `
    WITH candidates AS (
      SELECT a.id::text  AS meeting_id,
             a.title,
             lr.id::text AS last_run_id,
             lr.error_message,
             lr.finished_at,
             lr.scope_kind
        FROM assets a
        JOIN LATERAL (
          SELECT r.*
            FROM mn_runs r
           WHERE r.scope_kind = 'meeting'
             AND r.scope_id::text = a.id::text
           ORDER BY r.finished_at DESC NULLS LAST
           LIMIT 1
        ) lr ON TRUE
       WHERE lr.state = 'failed'
         AND lr.metadata->>'mode' = 'claude-cli'
         AND lr.error_message ~* 'inner JSON\\.parse failed|output malformed'
         AND lr.metadata->'fallback' IS NULL
         AND lr.finished_at > NOW() - ($1 || ' days')::interval
         AND NOT EXISTS (
           SELECT 1 FROM mn_runs x
            WHERE x.scope_kind = 'meeting'
              AND x.scope_id::text = a.id::text
              AND x.metadata->>'mode' = 'api-oneshot'
              AND (
                x.state IN ('queued', 'running')
                OR (x.state = 'succeeded' AND x.finished_at > NOW() - INTERVAL '24 hours')
              )
         )
       ORDER BY lr.finished_at DESC
       LIMIT $2
    )
    SELECT * FROM candidates
  `;
  const r = await client.query(sql, [String(maxAgeDays), limit]);
  const rows = r.rows;

  if (rows.length === 0) {
    console.log(`[nightly-fallback] 0 候选 (window=${maxAgeDays}d, limit=${limit})`);
    await client.end();
    process.exit(0);
  }

  console.log(`[nightly-fallback] ${rows.length} 个候选 (window=${maxAgeDays}d, limit=${limit}, dryRun=${dryRun})`);
  console.table(rows.map((x) => ({
    meeting: String(x.meeting_id).slice(0, 8) + '…',
    title: (x.title || '').slice(0, 40),
    last_run: String(x.last_run_id).slice(0, 8) + '…',
    err: (x.error_message || '').replace(/\s+/g, ' ').slice(0, 60),
    finished_at: x.finished_at?.toISOString?.() ?? String(x.finished_at),
  })));

  if (dryRun) {
    console.log('[nightly-fallback] dry-run，不入队');
    await client.end();
    process.exit(0);
  }

  let okCount = 0, failCount = 0;
  for (const x of rows) {
    const body = JSON.stringify({
      scope: { kind: 'meeting', id: x.meeting_id },
      axis: 'all',
      mode: 'api-oneshot',
      preset: 'standard',
      triggeredBy: 'cascade',
      parentRunId: x.last_run_id,
    });
    try {
      const resp = await fetch(`${apiBase}/api/v1/meeting-notes/runs`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body,
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.ok && json.runId) {
        // 在原 run 上写 metadata.fallback 关联，避免下次 nightly 重复入队
        await client.query(
          `UPDATE mn_runs SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'fallback', jsonb_build_object('mode','api-oneshot','runId',$2::text,'at',NOW()::text,'reason','nightly-fallback')
           ) WHERE id = $1`,
          [x.last_run_id, json.runId],
        );
        console.log(`  ✓ ${String(x.meeting_id).slice(0, 8)} → enqueued ${String(json.runId).slice(0, 8)}`);
        okCount++;
      } else {
        console.warn(`  ✗ ${String(x.meeting_id).slice(0, 8)} HTTP ${resp.status}: ${JSON.stringify(json).slice(0, 120)}`);
        failCount++;
      }
    } catch (e) {
      console.warn(`  ✗ ${String(x.meeting_id).slice(0, 8)} fetch error: ${e.message?.slice(0, 100)}`);
      failCount++;
    }
  }

  console.log(`[nightly-fallback] 完成: ${okCount} 入队成功, ${failCount} 失败`);
} finally {
  await client.end();
}

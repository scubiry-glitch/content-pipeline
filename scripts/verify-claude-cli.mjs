#!/usr/bin/env node
// 验证 claude-cli 模式的端到端落地状态（不跑新的 LLM 调用，纯查询现有数据）
//
// 输出 6 段 punch list：
//   §1. claude-cli runs 总览 + token / session 信息
//   §2. meeting 级 session 持久化（assets.metadata.claudeSession）
//   §3. scope 级 session + scope spawn 触发情况（mn_scopes.metadata + cliScopeResult）
//   §4. 17 张 mn_* 表的 source 分布（验证 mode 互不干扰）
//   §5. content_facts wiki 覆盖
//   §6. data/content-wiki/default/sources/<id>.md 文件落地
//
// 用法: node scripts/verify-claude-cli.mjs

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const envText = readFileSync(resolve(repoRoot, 'api/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const pool = new pg.Pool({
  host: env.DB_HOST,
  port: parseInt(env.DB_PORT ?? '5432', 10),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

const wikiRoot = process.env.MN_CLAUDE_WIKI_ROOT ?? join(repoRoot, 'data/content-wiki/default');

const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const warn = (s) => `\x1b[33m⚠\x1b[0m ${s}`;
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const MN_AXIS_TABLES = [
  'mn_commitments', 'mn_decisions', 'mn_assumptions', 'mn_open_questions', 'mn_risks',
  'mn_judgments', 'mn_mental_model_invocations', 'mn_evidence_grades', 'mn_cognitive_biases',
  'mn_counterfactuals', 'mn_decision_quality', 'mn_meeting_necessity', 'mn_affect_curve',
  'mn_speech_quality', 'mn_silence_signals', 'mn_role_trajectory_points',
  'mn_tensions', 'mn_consensus_items', 'mn_focus_map',
];

async function section1_runs() {
  console.log(bold('\n§1. claude-cli runs 总览'));
  const r = await pool.query(`
    SELECT r.id, r.scope_kind, r.scope_id::text AS scope_id, r.state,
           r.metadata->>'mode' AS mode,
           (r.metadata->>'inputTokens')::int AS input_tokens,
           (r.metadata->>'outputTokens')::int AS output_tokens,
           (r.metadata->'cliMeetingResult'->>'cacheReadTokens')::int AS cache_read_tokens,
           (r.metadata->'cliSessions'->>'meetingSessionId') AS meeting_session,
           (r.metadata->'cliSessions'->>'scopeSessionId') AS scope_session,
           (r.metadata->'cliScopeResult'->>'sessionResetTriggered')::boolean AS scope_reset,
           r.metadata->>'cliScopeError' AS scope_error,
           r.created_at, r.finished_at,
           COALESCE(a.title, a.metadata->>'title', '(library)') AS title
      FROM mn_runs r
      LEFT JOIN assets a ON a.id::text = r.scope_id::text
     WHERE r.metadata->>'mode' = 'claude-cli'
     ORDER BY r.created_at DESC LIMIT 20
  `);
  if (r.rows.length === 0) {
    console.log(warn('  没有 claude-cli mode 的 run，先跑一次再来验证'));
    return { runs: [] };
  }
  console.log(`  共 ${r.rows.length} 条 claude-cli run（最近 20 条）`);
  let cacheHits = 0;
  for (const row of r.rows) {
    const status = row.state === 'succeeded' ? ok('succeeded') : row.state === 'failed' ? bad('failed') : warn(row.state);
    const cache = (row.cache_read_tokens ?? 0) > 0 ? `${row.cache_read_tokens.toLocaleString()}↻` : '0';
    if ((row.cache_read_tokens ?? 0) > 0) cacheHits += 1;
    console.log(`    ${status} ${row.id.slice(0, 8)}.. · ${String(row.title).slice(0, 30).padEnd(30)} · in=${row.input_tokens ?? '?'} out=${row.output_tokens ?? '?'} cache=${cache}`);
    if (row.meeting_session) console.log(dim(`        meeting session: ${row.meeting_session.slice(0, 8)}…`));
    if (row.scope_session)   console.log(dim(`        scope   session: ${row.scope_session.slice(0, 8)}…  reset=${row.scope_reset}`));
    if (row.scope_error)     console.log(bad(`        scope spawn 失败: ${row.scope_error.slice(0, 80)}`));
  }
  if (cacheHits > 0) {
    console.log(ok(`  → ${cacheHits}/${r.rows.length} 次 run 命中 prompt cache（cache_read_input_tokens > 0），证实 prompt prefix 复用通路可用`));
  }
  return { runs: r.rows };
}

async function section2_meetingSession() {
  console.log(bold('\n§2. meeting 级 session 持久化'));
  const r = await pool.query(`
    SELECT a.id::text, COALESCE(a.title, a.metadata->>'title', '(untitled)') AS title,
           a.metadata->'claudeSession'->>'sessionId' AS session_id,
           (a.metadata->'claudeSession'->>'runCount')::int AS run_count,
           a.metadata->'claudeSession'->>'lastResumedAt' AS last_resumed
      FROM assets a
     WHERE a.metadata ? 'claudeSession'
     ORDER BY (a.metadata->'claudeSession'->>'lastResumedAt') DESC NULLS LAST
     LIMIT 10
  `);
  if (r.rows.length === 0) {
    console.log(warn('  没有 meeting 在 metadata.claudeSession 留下 session id'));
    return;
  }
  console.log(`  ${r.rows.length} 个 meeting 已有 claudeSession`);
  let reuseHits = 0;
  for (const row of r.rows) {
    const tag = (row.run_count ?? 0) > 1 ? ok(`reuse ×${row.run_count}`) : dim(`首次`);
    if ((row.run_count ?? 0) > 1) reuseHits += 1;
    console.log(`    ${tag} ${row.id.slice(0, 8)}.. · ${String(row.title).slice(0, 40)} · session ${String(row.session_id).slice(0, 8)}…`);
  }
  if (reuseHits > 0) {
    console.log(ok(`  → ${reuseHits} 个 meeting 已经触发过 --resume，prompt cache 复用通路证实可用`));
  } else {
    console.log(warn('  → 暂无 reuse 命中（需要同 meeting 跑第二次 claude-cli 才能验证 cache）'));
  }
}

async function section3_scopeSession() {
  console.log(bold('\n§3. scope 级 session + scope spawn 触发'));
  const r = await pool.query(`
    SELECT s.id::text, s.kind, s.name,
           s.metadata->'claudeSession'->>'sessionId' AS session_id,
           (s.metadata->'claudeSession'->>'runCount')::int AS run_count
      FROM mn_scopes s
     WHERE s.metadata ? 'claudeSession'
     ORDER BY (s.metadata->'claudeSession'->>'lastResumedAt') DESC NULLS LAST
  `);
  if (r.rows.length === 0) {
    console.log(warn('  没有 scope 在 metadata.claudeSession 留下 session id'));
    console.log(dim('  说明：scope spawn 仅在 project/client/topic 级 scope 触发；如果所有 run 都是 meeting 级，这里自然为空'));
    console.log(dim('  → 要测：先创建 project scope，绑定 ≥2 个 meeting，对每个 meeting 触发 claude-cli'));
    return;
  }
  console.log(`  ${r.rows.length} 个 scope 已有 claudeSession`);
  for (const row of r.rows) {
    const reuse = (row.run_count ?? 0) > 1 ? ok(`runs=${row.run_count}（累积中）`) : dim('runs=1（首次）');
    console.log(`    ${row.kind.padEnd(8)} ${row.name.slice(0, 30).padEnd(30)} · ${reuse} · session ${String(row.session_id).slice(0, 8)}…`);
  }

  const er = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE metadata->>'cliScopeError' IS NOT NULL)::int AS errs,
           COUNT(*) FILTER (WHERE metadata ? 'cliScopeResult')::int AS rets,
           COUNT(*) FILTER (WHERE (metadata->'cliScopeResult'->>'sessionResetTriggered')::boolean = true)::int AS resets
      FROM mn_runs WHERE metadata->>'mode' = 'claude-cli'
  `);
  const stat = er.rows[0];
  console.log(`  spawn #2 (scope) · 成功 ${stat.rets} 次 · 触发 reset ${stat.resets} 次 · 失败 ${stat.errs} 次`);
}

async function section4_modeInterop() {
  console.log(bold('\n§4. mn_* 表 source 分布（mode 互不干扰）'));
  const counts = {};
  for (const t of MN_AXIS_TABLES) {
    try {
      const c = await pool.query(`
        SELECT COALESCE(source, '(null)') AS src, COUNT(*)::int AS n
          FROM ${t}
         GROUP BY source ORDER BY source
      `);
      counts[t] = c.rows;
    } catch (e) {
      counts[t] = [{ src: '(no source col)', n: -1, err: e.message }];
    }
  }
  // 按表汇总
  let cliRows = 0, llmRows = 0, manualRows = 0, otherRows = 0;
  for (const [t, rows] of Object.entries(counts)) {
    const parts = rows.map((x) => `${x.src}=${x.n}`).join(' · ');
    console.log(`  ${t.padEnd(34)} ${parts}`);
    for (const row of rows) {
      if (row.src === 'claude_cli') cliRows += row.n;
      else if (row.src === 'llm_extracted') llmRows += row.n;
      else if (row.src === 'manual_import' || row.src === 'human_edit') manualRows += row.n;
      else if (row.n > 0) otherRows += row.n;
    }
  }
  console.log(`  ── 汇总 · claude_cli=${cliRows} · llm_extracted=${llmRows} · manual=${manualRows} · 其他=${otherRows}`);
  if (cliRows > 0 && llmRows > 0) {
    console.log(ok("  → 同库存在两个 source 的行，DELETE-replace 按 source='claude_cli' 不会误删 llm_extracted（mode 互不干扰证实）"));
  } else if (cliRows > 0 && llmRows === 0) {
    console.log(warn('  → 仅有 claude_cli 数据；要彻底测 mode 互不干扰，需对同 meeting 再跑一次 multi-axis'));
  } else {
    console.log(warn('  → 暂无 claude_cli 数据'));
  }
}

async function section5_facts() {
  console.log(bold('\n§5. content_facts · wiki SPO 三元组'));
  try {
    const r = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE context->>'source' = 'claude_cli')::int AS by_cli,
             COUNT(DISTINCT asset_id) FILTER (WHERE context->>'source' = 'claude_cli')::int AS meetings
        FROM content_facts
    `);
    const s = r.rows[0];
    console.log(`  content_facts 总行 ${s.total} · claude_cli 写入 ${s.by_cli} · 覆盖 ${s.meetings} 个 meeting`);
    if (s.by_cli > 0) console.log(ok('  → wiki facts 落地通路证实'));
    else console.log(warn('  → 暂无 claude_cli 写入的 facts'));
  } catch (e) {
    console.log(bad(`  content_facts 表查询失败: ${e.message}`));
  }
}

async function section6_wikiFiles() {
  console.log(bold('\n§6. wiki sources/.md 文件落地'));
  const sourcesDir = join(wikiRoot, 'sources');
  if (!existsSync(sourcesDir)) {
    console.log(warn(`  ${sourcesDir} 不存在`));
    return;
  }
  const r = await pool.query(`
    SELECT a.id::text FROM assets a WHERE a.metadata ? 'claudeSession'
  `);
  const meetings = r.rows.map((x) => x.id);
  let hit = 0, miss = 0;
  const missing = [];
  for (const id of meetings) {
    const p = join(sourcesDir, `${id}.md`);
    if (existsSync(p)) {
      const sz = statSync(p).size;
      hit += 1;
      if (hit <= 3) console.log(dim(`    ${id.slice(0, 8)}… → ${p.replace(repoRoot + '/', '')} (${sz}B)`));
    } else {
      miss += 1;
      missing.push(id.slice(0, 8));
    }
  }
  console.log(`  覆盖率 ${hit}/${meetings.length} (${meetings.length === 0 ? 0 : Math.round(hit / meetings.length * 100)}%)`);
  if (miss > 0) console.log(warn(`  缺失: ${missing.slice(0, 5).join(' / ')}${missing.length > 5 ? ` … 共 ${missing.length}` : ''}`));
  if (hit === meetings.length && meetings.length > 0) console.log(ok('  → 全部已生成 sources/.md'));
}

async function main() {
  console.log(bold('claude-cli 模式落地验证'));
  console.log(dim(`  DB: ${env.DB_NAME}@${env.DB_HOST}:${env.DB_PORT}`));
  console.log(dim(`  wikiRoot: ${wikiRoot}`));
  await section1_runs();
  await section2_meetingSession();
  await section3_scopeSession();
  await section4_modeInterop();
  await section5_facts();
  await section6_wikiFiles();
  console.log(bold('\n剩余需要新跑 LLM 的验证项'));
  console.log(`  · A 组 vs B 组专家：换 expertRoles 跑同一转写，对比 axes.knowledge.mentalModels 内容差异`);
  console.log(`  · lite vs max preset：换 preset 跑同一转写，对比 cognitiveBiases 丰度`);
  console.log(`  · 错误路径 #1: CLAUDE_CLI_BIN=/nonexistent npm run dev → 触发 ENOENT 落 metadata.cliRaw`);
  console.log(`  · 错误路径 #2: CLAUDE_CLI_TIMEOUT_MS=5000 → 触发 SIGKILL，error_message='claude-cli-timeout'`);
  console.log(`  · 150K 阈值：跑同一 scope 6+ 场会议，看 mn_scopes.metadata.claudeSession.sessionId 是否在 input_tokens > 150K 时被清空`);
  await pool.end();
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });

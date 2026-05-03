/**
 * 真实生成 CEO 棱镜内容（替代 ceo-generate-samples-s.ts 的字符串替换）
 *
 * 用法:
 *   cd api && npm run ceo:generate-real
 *
 * 默认对 4 个 scope（业务支持 / 美租 / 养老 / 集团分析）跑全部 10 个棱镜 prompt：
 *   compass-stars, compass-drift-alert, compass-echo,
 *   boardroom-rebuttal, boardroom-annotation, boardroom-concerns,
 *   situation-signal, situation-rubric,
 *   war-room-spark, balcony-prompt
 *   + panorama-aggregate (g5 = 规则计算)
 *
 * 行为:
 *   1. 校验 LLM 可用 + scope 至少 5 条 meeting + ceo_directors / ceo_stakeholders / brief 存在
 *   2. 按 scope × axis 调用对应 PROMPT_HANDLERS（不走 mn_runs queue，直接同步执行）
 *   3. 每条任务先 INSERT mn_runs (state=running, module='ceo')，handler 完成后写 succeeded/failed
 *   4. 全部跑完后导出 docs/ceo-app-samples-s/<prism>.json (pull from /api/v1/ceo/<prism>/dashboard)
 */
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'api', '.env'), join(__dirname, '../../.env')]) {
  try { dotenv.config({ path: p }); } catch { /* ignore */ }
}

const TARGET_SCOPE_NAMES = ['业务支持', '美租', '养老', '集团分析'];

// 顺序敏感 — compass-stars 必须先跑（drift-alert / echo 依赖 strategicLines）
const SCOPE_AXES = [
  'compass-stars',        // 必须最先：写 ceo_strategic_lines
  'compass-drift-alert',  // 依赖 strategic_lines
  'compass-echo',         // 依赖 strategic_lines
  'boardroom-concerns',   // 依赖 ceo_directors
  'boardroom-rebuttal',   // 依赖 ceo_directors
  'boardroom-annotation', // 依赖 expert_id 等 metadata
  'situation-signal',     // 依赖 ceo_stakeholders
  'situation-rubric',
  'war-room-spark',
  'balcony-prompt',       // 依赖 ceo_balcony_reflections 行
  'panorama-aggregate',   // g5 规则计算，无 LLM
] as const;

// brief × expert 配对（用于 boardroom-annotation）
const ANNOTATION_EXPERTS = [
  { expertId: 'lp-coach-v1', expertName: 'LP 关系教练' },
  { expertId: 'wei-rubric', expertName: 'Wei Zhao · 估值锚定 rubric' },
  { expertId: 'omar-cycle', expertName: 'Omar K. · 周期判断教练' },
  { expertId: 'sara-compliance', expertName: 'Sara M. · 合规备案教练' },
];

interface ScopeRow { id: string; name: string; meetingCount: number; }
interface AxisResult { scope: string; axis: string; ok: boolean; ms: number; error?: string; runId: string; }

async function main() {
  const args = process.argv.slice(2);
  const scopeFilter = args.find((a) => a.startsWith('--scopes='))?.slice('--scopes='.length).split(',');
  const dryRun = args.includes('--dry-run');
  const skipExport = args.includes('--skip-export');

  const { query, ensureDbPoolConnected } = await import('../db/connection.js');
  const { ensureCeoModuleSchema } = await import('../db/ensureCeoSchema.js');
  const { hasAvailableLLM, getAvailableLLMs, generateWithClaude, generateWithKimi, generateWithOpenAI } =
    await import('../services/llm.js');
  const { createServiceLLMCeoAdapter } = await import('../modules/ceo/adapters/llm.js');
  const { PROMPT_HANDLERS } = await import('../modules/ceo/pipelines/promptHandlers.js');
  const { handleCeoRun } = await import('../modules/ceo/pipelines/runHandlers.js');
  const { createCeoPipelineDeps } = await import('../modules/ceo/adapters/pipeline.js');

  await ensureDbPoolConnected();
  // 若 DB_AUTO_MIGRATE=false（典型生产/受限 DB 用户配置），跳过 schema ensure
  // 假设 ceo_* / mn_* 表已通过 server.ts 启动或手动 psql 部署
  if (process.env.DB_AUTO_MIGRATE !== 'false') {
    await ensureCeoModuleSchema(query);
  } else {
    console.log('[ceo-generate-real] DB_AUTO_MIGRATE=false — 跳过 schema ensure');
  }

  if (!hasAvailableLLM()) {
    console.error('[ceo-generate-real] 未配置 LLM API Key — 设置 CLAUDE_API_KEY / KIMI_API_KEY / OPENAI_API_KEY 任一');
    process.exit(2);
  }
  console.log(`[ceo-generate-real] LLM available: ${JSON.stringify(getAvailableLLMs())}`);

  // 1. 选目标 scope
  const targetNames = scopeFilter && scopeFilter.length > 0 ? scopeFilter : TARGET_SCOPE_NAMES;
  const placeholders = targetNames.map((_, i) => `$${i + 1}`).join(',');
  const scopeRes = await query(
    `SELECT s.id::text AS id, s.name,
            (SELECT COUNT(*)::int FROM mn_scope_members m WHERE m.scope_id = s.id) AS meeting_count
       FROM mn_scopes s
      WHERE s.status = 'active'
        AND s.kind = 'project'
        AND s.name IN (${placeholders})
      ORDER BY meeting_count DESC NULLS LAST`,
    targetNames,
  );
  const scopes: ScopeRow[] = (scopeRes.rows as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    meetingCount: Number(r.meeting_count ?? 0),
  }));
  if (scopes.length === 0) {
    console.error(`[ceo-generate-real] 没找到目标 scope: ${targetNames.join(', ')}`);
    process.exit(3);
  }
  console.log(`[ceo-generate-real] target scopes (${scopes.length}):`);
  for (const s of scopes) console.log(`  · ${s.name} (id=${s.id.slice(0, 8)}…, meetings=${s.meetingCount})`);

  if (dryRun) {
    console.log('[ceo-generate-real] --dry-run 已设，仅打印 plan，不入库');
    process.exit(0);
  }

  // 2. 前置检查 + 自动种子（directors / stakeholders / brief / reflections）
  for (const s of scopes) {
    if (s.meetingCount < 3) {
      console.warn(`[ceo-generate-real] WARN ${s.name} 只有 ${s.meetingCount} 条 meeting，prompt 上下文将很薄`);
    }
    await ensurePrerequisites(query, s);
  }

  // 3. 构造 deps
  const ceoLlm = createServiceLLMCeoAdapter({
    hasAvailable: hasAvailableLLM,
    available: getAvailableLLMs,
    generateWithClaude,
    generateWithKimi,
    generateWithOpenAI,
  });
  const deps = createCeoPipelineDeps({
    dbQuery: (sql, params) => query(sql, params),
    llm: ceoLlm,
  });

  // 4. 跑全部 axis
  const results: AxisResult[] = [];
  for (const scope of scopes) {
    for (const axis of SCOPE_AXES) {
      // 特殊：boardroom-annotation 需要按 expert 批量（4 条）
      if (axis === 'boardroom-annotation') {
        for (const exp of ANNOTATION_EXPERTS) {
          await runOneAxis(query, deps, scope, axis, results, {
            expertId: exp.expertId,
            expertName: exp.expertName,
          });
        }
      } else if (axis === 'balcony-prompt') {
        // balcony-prompt 需要 (userId, weekStart, prismId) — seed 一次行后跑 6 个 prism
        const weekStart = nextSundayStart();
        const userId = 'system';
        for (const prismId of ['direction', 'board', 'coord', 'team', 'ext', 'self'] as const) {
          await ensureBalconyReflectionRow(query, userId, weekStart, prismId);
          await runOneAxis(query, deps, scope, axis, results, { userId, weekStart, prismId });
        }
      } else if (axis === 'panorama-aggregate') {
        // 走老 handleCeoRun（g5 规则计算，不需要 LLM）
        await runOneAxisLegacy(query, deps, scope, axis, results, handleCeoRun);
      } else {
        await runOneAxis(query, deps, scope, axis, results);
      }
    }
  }

  // 5. 总结
  printSummary(results);

  // 6. 导出 dashboard JSON 到 docs/ceo-app-samples-s/
  if (!skipExport) {
    await exportSampleJsons(scopes, query);
  }

  process.exit(0);

  // ─── helpers ────────────────────────────
  async function runOneAxis(
    query: any,
    deps: any,
    scope: ScopeRow,
    axis: string,
    results: AxisResult[],
    extraMeta?: Record<string, unknown>,
  ) {
    const handler = PROMPT_HANDLERS[axis];
    if (!handler) {
      console.warn(`[${scope.name}/${axis}] PROMPT_HANDLERS 无此 axis`);
      return;
    }
    const t0 = Date.now();
    const ins = await query(
      `INSERT INTO mn_runs (module, scope_kind, scope_id, axis, state, triggered_by, preset, sub_dims, metadata)
       VALUES ('ceo', 'project', $1, $2, 'running', 'manual', 'lite', '{}', $3::jsonb)
       RETURNING id::text`,
      [scope.id, axis, JSON.stringify(extraMeta ?? {})],
    );
    const runId = String(ins.rows[0].id);
    const run = {
      id: runId,
      axis,
      scope_kind: 'project',
      scope_id: scope.id,
      metadata: extraMeta ?? null,
    };
    let ok = false;
    let error: string | undefined;
    try {
      const r = await handler(deps, run);
      ok = r.ok;
      error = r.error;
    } catch (e) {
      ok = false;
      error = (e as Error).message;
    }
    const ms = Date.now() - t0;
    if (ok) {
      await query(
        `UPDATE mn_runs SET state='succeeded', finished_at=NOW(), progress_pct=100 WHERE id=$1::uuid`,
        [runId],
      );
    } else {
      await query(
        `UPDATE mn_runs SET state='failed', finished_at=NOW(), error_message=$2 WHERE id=$1::uuid`,
        [runId, error ?? 'failed'],
      );
    }
    const tag = `${scope.name}/${axis}${extraMeta?.expertId ? `/${extraMeta.expertId}` : ''}${extraMeta?.prismId ? `/${extraMeta.prismId}` : ''}`;
    console.log(`[${ok ? 'OK ' : 'ERR'}] ${tag} (${ms}ms)${error ? ` — ${error.slice(0, 200)}` : ''}`);
    results.push({ scope: scope.name, axis: tag, ok, ms, error, runId });
  }

  async function runOneAxisLegacy(
    query: any,
    deps: any,
    scope: ScopeRow,
    axis: string,
    results: AxisResult[],
    handler: (deps: any, run: any) => Promise<{ ok: boolean; error?: string; result?: any }>,
  ) {
    const t0 = Date.now();
    const ins = await query(
      `INSERT INTO mn_runs (module, scope_kind, scope_id, axis, state, triggered_by, preset, sub_dims, metadata)
       VALUES ('ceo', 'project', $1, $2, 'running', 'manual', 'lite', '{}', '{}'::jsonb)
       RETURNING id::text`,
      [scope.id, axis],
    );
    const runId = String(ins.rows[0].id);
    const run = { id: runId, axis, scope_kind: 'project', scope_id: scope.id, metadata: null };
    let ok = false;
    let error: string | undefined;
    try {
      const r = await handler(deps, run);
      ok = r.ok;
      error = r.error;
    } catch (e) {
      ok = false;
      error = (e as Error).message;
    }
    const ms = Date.now() - t0;
    await query(
      ok
        ? `UPDATE mn_runs SET state='succeeded', finished_at=NOW(), progress_pct=100 WHERE id=$1::uuid`
        : `UPDATE mn_runs SET state='failed', finished_at=NOW(), error_message=$2 WHERE id=$1::uuid`,
      ok ? [runId] : [runId, error ?? 'failed'],
    );
    console.log(`[${ok ? 'OK ' : 'ERR'}] ${scope.name}/${axis} (${ms}ms)${error ? ` — ${error.slice(0, 200)}` : ''}`);
    results.push({ scope: scope.name, axis, ok, ms, error, runId });
  }
}

// ─── 前置数据保证 ────────────────────────────────────────────

async function ensurePrerequisites(query: any, scope: ScopeRow) {
  // ceo_directors — 至少 3 位
  const dirCount = (await query(
    `SELECT COUNT(*)::int AS n FROM ceo_directors
      WHERE scope_id IS NULL OR scope_id = $1::uuid`,
    [scope.id],
  )).rows[0]?.n ?? 0;
  if (dirCount < 3) {
    console.log(`[prereq] ${scope.name}: 种 5 位董事到 ceo_directors`);
    await query(
      `INSERT INTO ceo_directors (scope_id, name, role, weight) VALUES
        ($1::uuid, '林雾',     'LP 代表',     1.5),
        ($1::uuid, 'Wei Zhao', '独立董事',   1.2),
        ($1::uuid, 'Omar K.',  '独立董事',   1.2),
        ($1::uuid, '陆景行',   '创始合伙人', 1.0),
        ($1::uuid, 'Sara M.',  '法务顾问',   0.8)
       ON CONFLICT DO NOTHING`,
      [scope.id],
    );
  }

  // ceo_stakeholders — 至少 4 位
  const skCount = (await query(
    `SELECT COUNT(*)::int AS n FROM ceo_stakeholders WHERE scope_id IS NULL OR scope_id = $1::uuid`,
    [scope.id],
  )).rows[0]?.n ?? 0;
  if (skCount < 3) {
    console.log(`[prereq] ${scope.name}: 种 5 位 stakeholder`);
    await query(
      `INSERT INTO ceo_stakeholders (scope_id, name, kind, heat) VALUES
        ($1::uuid, '主要客户',     'customer',  0.8),
        ($1::uuid, '监管/合规',    'regulator', 0.5),
        ($1::uuid, '主投资人',     'investor',  0.7),
        ($1::uuid, '行业媒体',     'press',     0.4),
        ($1::uuid, '上下游伙伴',   'partner',   0.6)
       ON CONFLICT DO NOTHING`,
      [scope.id],
    );
  }

  // ceo_briefs — 至少 1 个 draft（boardroom-annotation 用）
  const briefCount = (await query(
    `SELECT COUNT(*)::int AS n FROM ceo_briefs
      WHERE status = 'draft' AND (scope_id IS NULL OR scope_id = $1::uuid)`,
    [scope.id],
  )).rows[0]?.n ?? 0;
  if (briefCount < 1) {
    console.log(`[prereq] ${scope.name}: 创建 1 份 draft brief`);
    await query(
      `INSERT INTO ceo_briefs (scope_id, board_session, version, toc, page_count, status)
       VALUES ($1::uuid, '2026 Q2 · BOARD #14', 1, '[]'::jsonb, 12, 'draft')`,
      [scope.id],
    );
  }
}

async function ensureBalconyReflectionRow(
  query: any,
  userId: string,
  weekStart: string,
  prismId: 'direction' | 'board' | 'coord' | 'team' | 'ext' | 'self',
) {
  const QUESTIONS: Record<string, string> = {
    direction: '本周你把时间花在战略主线上了吗？',
    board:     '下次董事会你最该带去的那个事是什么？',
    coord:     '哪一条承诺你今晚最怕被问起？',
    team:      '你的 No.2 这周和你说的最重要的一句话是什么？',
    ext:       '哪一类外部信号你这周躲开了，没正视？',
    self:      '本周你做的最满意 / 最遗憾的一个决定？',
  };
  await query(
    `INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question)
     VALUES ($1, $2::date, $3, $4)
     ON CONFLICT (user_id, week_start, prism_id) DO NOTHING`,
    [userId, weekStart, prismId, QUESTIONS[prismId]],
  );
}

function nextSundayStart(): string {
  const d = new Date();
  // 周日 = 0；本周日 0:00（如果今天是周日则用今天）
  const diffToSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + diffToSunday);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// ─── 总结 + 导出 ────────────────────────────────────────────

function printSummary(results: AxisResult[]) {
  const total = results.length;
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const totalMs = results.reduce((a, r) => a + r.ms, 0);
  console.log('\n────────── SUMMARY ──────────');
  console.log(`total: ${total}, ok: ${ok}, failed: ${failed.length}, totalMs: ${totalMs}`);
  if (failed.length > 0) {
    console.log('\nFailed axes:');
    for (const f of failed) {
      console.log(`  - ${f.axis}: ${f.error?.slice(0, 200)}`);
    }
  }
}

async function exportSampleJsons(scopes: ScopeRow[], query: any) {
  const repoRoot = join(__dirname, '../../..');
  const outDir = join(repoRoot, 'docs/ceo-app-samples-s');
  if (!existsSync(outDir)) {
    console.warn(`[export] ${outDir} 不存在，跳过导出`);
    return;
  }
  const scopeIds = scopes.map((s) => s.id);
  const PRISM_TO_TABLE: Record<string, string[]> = {
    compass: ['ceo_strategic_lines', 'ceo_strategic_echos'],
    boardroom: ['ceo_directors', 'ceo_director_concerns', 'ceo_briefs', 'ceo_rebuttal_rehearsals', 'ceo_boardroom_annotations'],
    situation: ['ceo_stakeholders', 'ceo_external_signals', 'ceo_rubric_scores'],
    balcony: ['ceo_balcony_reflections'],
    'war-room': ['ceo_war_room_sparks'],
  };
  const summary: Record<string, Record<string, number>> = {};
  for (const [prism, tables] of Object.entries(PRISM_TO_TABLE)) {
    summary[prism] = {};
    for (const t of tables) {
      try {
        const r = await query(
          `SELECT COUNT(*)::int AS n FROM ${t} WHERE scope_id = ANY($1::uuid[])`,
          [scopeIds],
        );
        summary[prism][t] = r.rows[0]?.n ?? 0;
      } catch (e) {
        summary[prism][t] = -1;
      }
    }
  }
  const outPath = join(outDir, '_real-content-summary.json');
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        scopes: scopes.map((s) => ({ id: s.id, name: s.name, meetingCount: s.meetingCount })),
        row_counts_per_table: summary,
        note: '行数 = 4 个 scope 总和；每个棱镜实际 dashboard 拉取见 /api/v1/ceo/<prism>/dashboard',
      },
      null,
      2,
    ),
  );
  console.log(`\n[export] wrote summary → ${outPath}`);
}

main().catch((e) => {
  console.error('[ceo-generate-real] failed:', e);
  process.exit(1);
});

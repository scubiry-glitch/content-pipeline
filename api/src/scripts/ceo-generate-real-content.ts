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

// 缺省 scope 选取行为:
//   - 不传 --scopes 时, 查 ws 下所有 active project scope (workspace_id=$ws AND kind='project' AND status='active')
//   - 传了 --scopes=A,B 时, 在 ws 内按名字精确匹配
// 历史上这里写死 ['业务支持', '美租', '养老', '集团分析'] (default ws 的种子数据), 已废弃
//   — 多 ws 时强制硬名单会导致空集 / 串 ws 风险。

// 全部 axis 的 DAG：deps 是同 scope 内的 axis 名，跨 scope 互不依赖（4 scope 完全并行）
//
// Tier 0 (无 axis 内 dep, 直接 ready):
//   compass-stars / boardroom-concerns / boardroom-rebuttal / boardroom-annotation × N
//   situation-signal / situation-rubric / war-room-spark / war-room-formation
//   ceo-decisions-capture / balcony-prompt × 6
//   tower-attention-alloc (fast) / balcony-time-roi (fast)
//
// Tier 1 (依赖 Tier 0):
//   compass-drift-alert / compass-echo / compass-narrative ← compass-stars
//   boardroom-promises ← boardroom-concerns
//   boardroom-brief-toc ← boardroom-concerns + boardroom-rebuttal
//
// Tier 2 (最后):
//   panorama-aggregate ← 全部上游
const AXIS_DEPS: Record<string, string[]> = {
  'compass-stars':         [],
  'compass-drift-alert':   ['compass-stars'],
  'compass-echo':          ['compass-stars'],
  'compass-narrative':     ['compass-stars'],
  'boardroom-concerns':    [],
  'boardroom-rebuttal':    [],
  'boardroom-annotation':  [],   // expert 维度展开后单独 deps
  'boardroom-brief-toc':   ['boardroom-concerns', 'boardroom-rebuttal'],
  'boardroom-promises':    ['boardroom-concerns'],
  'situation-signal':      [],
  'situation-rubric':      [],
  'war-room-spark':        [],
  'war-room-formation':    [],
  'ceo-decisions-capture': [],
  'balcony-prompt':        [],   // prism 维度展开后单独 deps
  'tower-attention-alloc': [],   // 派生计算 (group=fast)
  'balcony-time-roi':      [],   // 派生计算 (group=fast)
  'panorama-aggregate':    [
    'compass-stars', 'compass-echo', 'compass-narrative',
    'boardroom-concerns', 'boardroom-rebuttal',
    'situation-signal', 'situation-rubric',
    'war-room-spark', 'balcony-prompt',
  ],
};

const SCOPE_AXES = Object.keys(AXIS_DEPS) as readonly string[];

// 标记哪些 axis 是"派生计算" (走 fast pool, 不消耗 LLM 名额)
const FAST_AXES = new Set(['tower-attention-alloc', 'balcony-time-roi', 'panorama-aggregate']);

// brief × expert 配对（用于 boardroom-annotation）— S 级专家库
const ANNOTATION_EXPERTS = [
  { expertId: 'lp-coach-v1',     expertName: '沈南鹏 · LP 关系教练' },         // S-11 风险投资/合伙人评审
  { expertId: 'wei-rubric',      expertName: '马斯克 · 估值锚定 rubric' },     // S-03 第一性原理/反行业共识
  { expertId: 'omar-cycle',      expertName: '张一鸣 · 周期判断教练' },        // S-01 延迟满足/产品增长
  { expertId: 'sara-compliance', expertName: '任正非 · 合规备案教练' },        // S-06 战略定力/组织建设
];

interface ScopeRow { id: string; name: string; meetingCount: number; }
interface AxisResult { scope: string; axis: string; ok: boolean; ms: number; error?: string; runId: string; }

async function main() {
  const args = process.argv.slice(2);
  const scopeFilter = args.find((a) => a.startsWith('--scopes='))?.slice('--scopes='.length).split(',');
  const dryRun = args.includes('--dry-run');
  const skipExport = args.includes('--skip-export');
  const useClaudeCli = args.includes('--mode=claude-cli');
  const wsSlug = args.find((a) => a.startsWith('--workspace='))?.slice('--workspace='.length) ?? 'default';
  // --axes=axis1,axis2,boardroom-annotation/lp-coach-v1,balcony-prompt/team
  // 用于"只重跑这些 axis"的 retry 模式 — 已成功的 axis 不动, 上游依赖也不重跑.
  // 注意: 子任务键形如 "boardroom-annotation/<expertId>"、"balcony-prompt/<prismId>".
  const axisFilter = args.find((a) => a.startsWith('--axes='))?.slice('--axes='.length).split(',').map((s) => s.trim()).filter(Boolean);
  // 当无 ALTER TABLE 权限时（DB 用户非表 owner），mn_runs 的 axis 列还是 VARCHAR(16)，
  // 长 axis 名 INSERT 会失败 — --skip-runs-insert 跳过 mn_runs INSERT/UPDATE，仅写
  // 业务表（ceo_strategic_lines 等）。
  const skipRunsInsert = args.includes('--skip-runs-insert') || useClaudeCli;

  const { query, ensureDbPoolConnected } = await import('../db/connection.js');
  const { ensureCeoModuleSchema } = await import('../db/ensureCeoSchema.js');
  const { hasAvailableLLM, getAvailableLLMs, generateWithClaude, generateWithKimi, generateWithOpenAI } =
    await import('../services/llm.js');
  const { createServiceLLMCeoAdapter, createClaudeCliCeoLLMAdapterV2 } =
    await import('../modules/ceo/adapters/llm.js');
  const { PROMPT_HANDLERS } = await import('../modules/ceo/pipelines/promptHandlers.js');
  const { handleCeoRun } = await import('../modules/ceo/pipelines/runHandlers.js');
  const { createCeoPipelineDeps } = await import('../modules/ceo/adapters/pipeline.js');
  // 注：aggregateAttentionAlloc / aggregateTimeRoi 在调度器处再单独 import (line ~195)，
  // 避免重复声明错误（tsx esbuild 严格 const 重声明检查）

  await ensureDbPoolConnected();
  // 若 DB_AUTO_MIGRATE=false（典型生产/受限 DB 用户配置），跳过 schema ensure
  // 假设 ceo_* / mn_* 表已通过 server.ts 启动或手动 psql 部署
  if (process.env.DB_AUTO_MIGRATE !== 'false') {
    await ensureCeoModuleSchema(query);
  } else {
    console.log('[ceo-generate-real] DB_AUTO_MIGRATE=false — 跳过 schema ensure');
  }

  if (!useClaudeCli && !hasAvailableLLM()) {
    console.error('[ceo-generate-real] 未配置 LLM API Key — 设置 CLAUDE_API_KEY / KIMI_API_KEY / OPENAI_API_KEY 任一，\n  或加 --mode=claude-cli 复用本地 claude CLI');
    process.exit(2);
  }
  if (useClaudeCli) {
    console.log('[ceo-generate-real] mode=claude-cli (复用本地 claude CLI; 不读 API_KEY env)');
  } else {
    console.log(`[ceo-generate-real] LLM available: ${JSON.stringify(getAvailableLLMs())}`);
  }
  if (skipRunsInsert) {
    console.log('[ceo-generate-real] --skip-runs-insert 已开 — 不写 mn_runs，仅写业务表 (ceo_*)');
  }

  // 0. 解析目标 workspace
  const wsId = await resolveWsIdBySlug(query, wsSlug);
  console.log(`[ceo-generate-real] workspace: slug=${wsSlug} id=${wsId.slice(0, 8)}…`);

  // 1. 选目标 scope (限定在 wsId 内, 避免跨 workspace 串数据)
  //    - 没传 --scopes: 取 ws 下全部 active project scope
  //    - 传了 --scopes=A,B: 在 ws 内按名字过滤
  let scopeRes: { rows: any[] };
  if (scopeFilter && scopeFilter.length > 0) {
    const placeholders = scopeFilter.map((_, i) => `$${i + 1}`).join(',');
    scopeRes = await query(
      `SELECT s.id::text AS id, s.name,
              (SELECT COUNT(*)::int FROM mn_scope_members m WHERE m.scope_id = s.id) AS meeting_count
         FROM mn_scopes s
        WHERE s.status = 'active'
          AND s.kind = 'project'
          AND s.workspace_id = $${scopeFilter.length + 1}::uuid
          AND s.name IN (${placeholders})
        ORDER BY meeting_count DESC NULLS LAST`,
      [...scopeFilter, wsId],
    );
  } else {
    scopeRes = await query(
      `SELECT s.id::text AS id, s.name,
              (SELECT COUNT(*)::int FROM mn_scope_members m WHERE m.scope_id = s.id) AS meeting_count
         FROM mn_scopes s
        WHERE s.status = 'active'
          AND s.kind = 'project'
          AND s.workspace_id = $1::uuid
        ORDER BY meeting_count DESC NULLS LAST, s.name`,
      [wsId],
    );
  }
  const scopes: ScopeRow[] = (scopeRes.rows as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    meetingCount: Number(r.meeting_count ?? 0),
  }));
  if (scopes.length === 0) {
    const filterDesc = scopeFilter && scopeFilter.length > 0
      ? `--scopes=${scopeFilter.join(',')}`
      : '(缺省: ws 下全部 active project scope)';
    console.error(`[ceo-generate-real] 没找到目标 scope (ws=${wsSlug}) ${filterDesc}`);
    process.exit(3);
  }
  console.log(`[ceo-generate-real] target scopes (${scopes.length}):`);
  for (const s of scopes) console.log(`  · ${s.name} (id=${s.id.slice(0, 8)}…, meetings=${s.meetingCount})`);

  if (dryRun) {
    console.log('[ceo-generate-real] --dry-run 已设，仅打印 plan，不入库');
    process.exit(0);
  }

  // 2a. --clean: 清掉本 scope 上次 generate-real 写的内容（保留 directors / stakeholders / brief 元数据）
  if (args.includes('--clean')) {
    for (const s of scopes) await cleanGeneratedContent(query, s);
  }

  // 2. 前置检查 + 自动种子（directors / stakeholders / brief / reflections）
  for (const s of scopes) {
    if (s.meetingCount < 3) {
      console.warn(`[ceo-generate-real] WARN ${s.name} 只有 ${s.meetingCount} 条 meeting，prompt 上下文将很薄`);
    }
    await ensurePrerequisites(query, s);
  }

  // 3. 构造 deps — 选 LLM 适配器
  const ceoLlm = useClaudeCli
    ? createClaudeCliCeoLLMAdapterV2({})
    : createServiceLLMCeoAdapter({
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

  // 4. 跑全部 axis — DAG 调度 + 并发上限（同时最多 N 条 LLM 任务，4 scope 完全并行）
  const { runCliScheduler, defaultProgressHooks } = await import('./_lib/cli-scheduler.js');
  const { aggregateAttentionAlloc } = await import('../modules/ceo/aggregators/attention-alloc.js');
  const { aggregateTimeRoi } = await import('../modules/ceo/aggregators/time-roi.js');
  const llmConcurrency = Number(
    args.find((a) => a.startsWith('--concurrency='))?.slice('--concurrency='.length)
      ?? process.env.CEO_CLI_CONCURRENCY ?? 10,
  );
  const fastConcurrency = 4;
  console.log(`[ceo-generate-real] 调度并发: llm=${llmConcurrency}, fast=${fastConcurrency}`);

  const results: AxisResult[] = [];

  // 聚合器调度入口（无 LLM, 只走 fast pool）
  async function runAggregator(scope: ScopeRow, axis: string): Promise<{ ok: boolean; error?: string }> {
    const t0 = Date.now();
    try {
      if (axis === 'tower-attention-alloc') {
        await aggregateAttentionAlloc(deps, scope.id);
      } else if (axis === 'balcony-time-roi') {
        // 显式传 wsId, 否则 aggregator 自动 fallback 到 default ws (跨 ws bug)
        await aggregateTimeRoi(deps, 'system', wsId);
      } else {
        return { ok: false, error: `unknown aggregator axis: ${axis}` };
      }
      const ms = Date.now() - t0;
      results.push({ scope: scope.name, axis, ok: true, ms, runId: 'agg-' + axis });
      return { ok: true };
    } catch (e) {
      const ms = Date.now() - t0;
      const err = (e as Error).message;
      results.push({ scope: scope.name, axis, ok: false, ms, error: err, runId: 'agg-' + axis });
      return { ok: false, error: err };
    }
  }

  const tasks: any[] = [];

  // 每个 scope 内：把每个 axis 转成 1 或多条 task。axis 维度的 deps 转成 task key 维度。
  for (const scope of scopes) {
    const scopeKey = (axis: string) => `${scope.name}/${axis}`;
    const expandDeps = (depAxes: string[]): string[] =>
      depAxes.flatMap((d) => {
        // boardroom-annotation 展开成 4 个 expert task → dep on annotation 时挑一个代表（取第 1 个 expert）
        if (d === 'boardroom-annotation') return [`${scope.name}/${d}/${ANNOTATION_EXPERTS[0].expertId}`];
        // balcony-prompt 展开成 6 prism → dep 取第 1 个 prism
        if (d === 'balcony-prompt') return [`${scope.name}/${d}/direction`];
        return [scopeKey(d)];
      });

    for (const axis of SCOPE_AXES) {
      const baseDeps = expandDeps(AXIS_DEPS[axis] ?? []);

      if (axis === 'boardroom-annotation') {
        for (const exp of ANNOTATION_EXPERTS) {
          tasks.push({
            key: `${scope.name}/${axis}/${exp.expertId}`,
            deps: baseDeps,
            group: 'llm',
            run: () => runOneAxis(query, deps, scope, axis, results, {
              expertId: exp.expertId, expertName: exp.expertName,
            }),
          });
        }
      } else if (axis === 'balcony-prompt') {
        const weekStart = nextSundayStart();
        const userId = 'system';
        for (const prismId of ['direction', 'board', 'coord', 'team', 'ext', 'self'] as const) {
          tasks.push({
            key: `${scope.name}/${axis}/${prismId}`,
            deps: baseDeps,
            group: 'llm',
            run: async () => {
              await ensureBalconyReflectionRow(query, userId, weekStart, prismId);
              return runOneAxis(query, deps, scope, axis, results, { userId, weekStart, prismId });
            },
          });
        }
      } else if (axis === 'panorama-aggregate') {
        tasks.push({
          key: scopeKey(axis),
          deps: baseDeps,
          group: 'fast',
          run: () => runOneAxisLegacy(query, deps, scope, axis, results, handleCeoRun),
        });
      } else if (axis === 'tower-attention-alloc' || axis === 'balcony-time-roi') {
        // 派生计算（不走 LLM）— fast pool
        tasks.push({
          key: scopeKey(axis),
          deps: baseDeps,
          group: 'fast',
          run: () => runAggregator(scope, axis),
        });
      } else {
        tasks.push({
          key: scopeKey(axis),
          deps: baseDeps,
          group: 'llm',
          run: () => runOneAxis(query, deps, scope, axis, results),
        });
      }
    }
  }

  // --axes 过滤: 只跑指定 axis. 保留 filter 内 task 的内部 deps (这样 panorama-aggregate
  // 仍会等本轮 compass-narrative 完成); 清掉指向 filter 外 task 的 deps (假设上轮已成功).
  let scheduledTasks = tasks;
  if (axisFilter && axisFilter.length > 0) {
    const wanted = new Set(axisFilter);
    const matched = tasks.filter((t) => {
      const tail = String(t.key).split('/').slice(1).join('/');
      return wanted.has(tail);
    });
    const matchedKeys = new Set(matched.map((t) => t.key));
    scheduledTasks = matched.map((t) => ({
      ...t,
      deps: (t.deps as string[]).filter((d) => matchedKeys.has(d)),
    }));
    console.log(`[ceo-generate-real] --axes 过滤生效: ${scheduledTasks.length}/${tasks.length} task 命中 (${axisFilter.join(', ')})`);
    if (scheduledTasks.length === 0) {
      console.error('[ceo-generate-real] --axes 没匹配到任何 task');
      process.exit(4);
    }
  }
  console.log(`[ceo-generate-real] 共 ${scheduledTasks.length} 个 task (LLM=${scheduledTasks.filter((t) => t.group === 'llm').length}, fast=${scheduledTasks.filter((t) => t.group === 'fast').length})`);

  await runCliScheduler(scheduledTasks, {
    llmConcurrency,
    fastConcurrency,
    ...defaultProgressHooks('ceo'),
  });

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
      const err = `PROMPT_HANDLERS 无此 axis`;
      console.warn(`[${scope.name}/${axis}] ${err}`);
      return { ok: false, error: err };
    }
    const t0 = Date.now();
    let runId: string;
    if (skipRunsInsert) {
      // 不写 mn_runs，仍生成 UUID 让下游 SQL（INSERT ... generated_run_id）有 fk 值
      runId = (await query(`SELECT gen_random_uuid()::text AS id`)).rows[0].id;
    } else {
      const ins = await query(
        `INSERT INTO mn_runs (module, scope_kind, scope_id, axis, state, triggered_by, preset, sub_dims, metadata)
         VALUES ('ceo', 'project', $1, $2, 'running', 'manual', 'lite', '{}', $3::jsonb)
         RETURNING id::text`,
        [scope.id, axis, JSON.stringify(extraMeta ?? {})],
      );
      runId = String(ins.rows[0].id);
    }
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
    if (!skipRunsInsert) {
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
    }
    const tag = `${scope.name}/${axis}${extraMeta?.expertId ? `/${extraMeta.expertId}` : ''}${extraMeta?.prismId ? `/${extraMeta.prismId}` : ''}`;
    results.push({ scope: scope.name, axis: tag, ok, ms, error, runId });
    return { ok, error };
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
    let runId: string;
    if (skipRunsInsert) {
      runId = (await query(`SELECT gen_random_uuid()::text AS id`)).rows[0].id;
    } else {
      const ins = await query(
        `INSERT INTO mn_runs (module, scope_kind, scope_id, axis, state, triggered_by, preset, sub_dims, metadata)
         VALUES ('ceo', 'project', $1, $2, 'running', 'manual', 'lite', '{}', '{}'::jsonb)
         RETURNING id::text`,
        [scope.id, axis],
      );
      runId = String(ins.rows[0].id);
    }
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
    if (!skipRunsInsert) {
      await query(
        ok
          ? `UPDATE mn_runs SET state='succeeded', finished_at=NOW(), progress_pct=100 WHERE id=$1::uuid`
          : `UPDATE mn_runs SET state='failed', finished_at=NOW(), error_message=$2 WHERE id=$1::uuid`,
        ok ? [runId] : [runId, error ?? 'failed'],
      );
    }
    results.push({ scope: scope.name, axis, ok, ms, error, runId });
    return { ok, error };
  }
}

// ─── 前置数据保证 ────────────────────────────────────────────

async function ensurePrerequisites(query: any, scope: ScopeRow) {
  // ceo_directors — 至少 3 位 (本 scope 内, 不再认 NULL-scope 全局 demo seeds 顶替)
  // 历史 bug: 旧检查 `scope_id IS NULL OR scope_id = $1` 在 default ws 有 NULL-scope demo seeds
  //   时会满足 count >= 3, 跳过 INSERT, 导致非 default ws scope 永远没有自己的 directors
  //   → handler 通过 OR scope_id IS NULL 读到 demo seeds, 跨 ws 串数据.
  // 修法: 收紧到 scope_id = $1, 同时配合 prompts/index.ts 去掉 IS NULL fallback.
  const dirCount = (await query(
    `SELECT COUNT(*)::int AS n FROM ceo_directors WHERE scope_id = $1::uuid`,
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

  // ceo_stakeholders — 至少 4 位 (同 directors, scope_id 严格匹配)
  const skCount = (await query(
    `SELECT COUNT(*)::int AS n FROM ceo_stakeholders WHERE scope_id = $1::uuid`,
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
  // 注意：原 SELECT 的 `scope_id IS NULL OR scope_id = $1::uuid` 条件下，
  // 如果其他 scope 共享 NULL scope_id 的 brief（demo seed 留的），会误以为本 scope 已有 draft
  // → 收紧到 scope_id = $1，每个 scope 独立判断
  const briefCount = (await query(
    `SELECT COUNT(*)::int AS n FROM ceo_briefs
      WHERE status = 'draft' AND scope_id = $1::uuid`,
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

// main() 解析 --workspace=<slug> 后通过 resolveWsIdBySlug 设置；ensureBalconyReflectionRow
// 等子流程从这里读，避免再到处穿参。
let currentWsIdCache: string | null = null;
async function resolveWsIdBySlug(query: any, slug: string): Promise<string> {
  const r = await query(`SELECT id FROM workspaces WHERE slug = $1 LIMIT 1`, [slug]);
  if (!r.rows[0]) throw new Error(`workspace slug='${slug}' not found`);
  currentWsIdCache = r.rows[0].id as string;
  return currentWsIdCache;
}
function getCurrentWsIdOrThrow(): string {
  if (!currentWsIdCache) throw new Error('wsId 尚未解析 — main() 必须先调用 resolveWsIdBySlug');
  return currentWsIdCache;
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
  const wsId = getCurrentWsIdOrThrow();
  await query(
    `INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question, workspace_id)
     VALUES ($1, $2::date, $3, $4, $5::uuid)
     ON CONFLICT (user_id, week_start, prism_id) DO NOTHING`,
    [userId, weekStart, prismId, QUESTIONS[prismId], wsId],
  );
}

async function cleanGeneratedContent(query: any, scope: ScopeRow): Promise<void> {
  // 仅清"生成内容"类表；保留 directors / stakeholders 元数据 + brief 行（重置 body_md/toc）
  const targets = [
    // 迭代 1 表
    `DELETE FROM ceo_strategic_echos WHERE line_id IN (SELECT id FROM ceo_strategic_lines WHERE scope_id = $1::uuid)`,
    `DELETE FROM ceo_strategic_lines WHERE scope_id = $1::uuid`,
    `DELETE FROM ceo_director_concerns WHERE director_id IN (SELECT id FROM ceo_directors WHERE scope_id = $1::uuid)`,
    `DELETE FROM ceo_rebuttal_rehearsals WHERE scope_id = $1::uuid`,
    `DELETE FROM ceo_boardroom_annotations WHERE scope_id = $1::uuid`,
    `DELETE FROM ceo_external_signals WHERE stakeholder_id IN (SELECT id FROM ceo_stakeholders WHERE scope_id = $1::uuid)`,
    `DELETE FROM ceo_rubric_scores WHERE scope_id = $1::uuid`,
    `DELETE FROM ceo_war_room_sparks WHERE scope_id = $1::uuid`,
    // 迭代 2 新增表
    `DELETE FROM ceo_formation_snapshots WHERE scope_id = $1::uuid`,
    `DELETE FROM ceo_decisions WHERE scope_id = $1::uuid`,
    // ceo_board_promises: 仅删 LLM 生成的（source_decision_id 以 'generated:' 开头）
    `DELETE FROM ceo_board_promises WHERE brief_id IN (SELECT id FROM ceo_briefs WHERE scope_id = $1::uuid) AND source_decision_id LIKE 'generated:%'`,
    // ceo_attention_alloc: 仅删派生计算的行（source='aggregated'），保留 demo 手填的 source='manual'
    `DELETE FROM ceo_attention_alloc WHERE scope_id = $1::uuid AND source = 'aggregated'`,
    // ceo_briefs: 重置 LLM 写入的 body_md/toc/page_count，保留 brief 行 metadata
    `UPDATE ceo_briefs SET body_md = NULL, toc = '[]'::jsonb, page_count = 12, generated_run_id = NULL, generated_at = NULL WHERE scope_id = $1::uuid`,
    // balcony-prompt 不删，仅 UPDATE prompt 列；但同 user/week/prism 唯一约束已经保证幂等
  ];
  for (const sql of targets) {
    await query(sql, [scope.id]);
  }
  // ceo_time_roi 是 user 级而非 scope 级 — 仅在第一个 scope 触发时清理一次（多 scope 重复 DELETE 也无害，但避免日志噪音）
  // 简单起见：每个 scope clean 都执行，DELETE 0 行也 OK
  await query(
    `DELETE FROM ceo_time_roi WHERE metadata->>'source' = 'aggregated'`,
  );
  console.log(`[clean] ${scope.name}: 清掉旧生成内容（10 张表 + brief 重置 + time_roi/aggregated）`);
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

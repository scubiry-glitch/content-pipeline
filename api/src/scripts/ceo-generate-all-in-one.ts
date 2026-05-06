/**
 * CEO 全部 axes 一次性生成 (one-shot claude CLI)
 *
 * 与 ceo-generate-real-content.ts 对照:
 *   逐个跑版本: 21+ 次 claude CLI spawn, 每个 axis 一次 prompt+invoke, 总耗时 ~6min
 *   一次性版本: 1 次 claude CLI spawn, 单 mega-prompt 让 LLM 一次输出全部 axes JSON
 *               解析后用 MegaResultAdapter 让每个 handler 复用 INSERT 逻辑 (零重复)
 *
 * 用法:
 *   cd api && npx tsx src/scripts/ceo-generate-all-in-one.ts \
 *     --workspace=ws-1777959477843 --scope='AI 升级' --concurrency=1 [--dry-run]
 *
 * 与 ceo-generate-real-content 共用:
 *   - PROMPTS 字典 (axis schema + system+user prompt + qualityChecks)
 *   - PROMPT_HANDLERS (各 axis INSERT 逻辑)
 *   - aggregator: aggregateAttentionAlloc / aggregateTimeRoi (派生计算, 1 次性脚本仍跑)
 *
 * 风险:
 *   - 单次 claude CLI 输出 token 上限 (Sonnet 默认 8k, Opus 默认 4-8k) 可能截断
 *   - 21 axes × 平均 500 tokens 输出 ≈ 10k token. 边界 → 若失败退回逐个跑
 *   - JSON 截断时, 哪些 axis 缺失就报哪些, 让 user 用 --axes= 补刀
 */
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

for (const p of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'api', '.env')]) {
  try { dotenv.config({ path: p }); } catch { /* ignore */ }
}

// ─── 全 axes 清单 (含子任务展开) ────────────────────────────────────
//
// 顶层 axis (PROMPTS 字典 key) + 子任务 suffix 的格式: "<axis>/<sub>"
// 与 ceo-generate-real-content.ts 一致:
//   boardroom-annotation × 4 expert
//   balcony-prompt × 6 prism
const ALL_AXES_LIST: Array<{ axisKey: string; baseAxis: string; suffix?: string; meta?: Record<string, any> }> = [
  { axisKey: 'compass-stars',         baseAxis: 'compass-stars' },
  { axisKey: 'compass-drift-alert',   baseAxis: 'compass-drift-alert' },
  { axisKey: 'compass-echo',          baseAxis: 'compass-echo' },
  { axisKey: 'compass-narrative',     baseAxis: 'compass-narrative' },
  { axisKey: 'boardroom-concerns',    baseAxis: 'boardroom-concerns' },
  { axisKey: 'boardroom-rebuttal',    baseAxis: 'boardroom-rebuttal' },
  ...['lp-coach-v1', 'wei-rubric', 'omar-cycle', 'sara-compliance'].map((expertId) => ({
    axisKey: `boardroom-annotation/${expertId}`,
    baseAxis: 'boardroom-annotation',
    suffix: expertId,
  })),
  { axisKey: 'boardroom-promises',    baseAxis: 'boardroom-promises' },
  { axisKey: 'boardroom-brief-toc',   baseAxis: 'boardroom-brief-toc' },
  { axisKey: 'situation-signal',      baseAxis: 'situation-signal' },
  { axisKey: 'situation-rubric',      baseAxis: 'situation-rubric' },
  { axisKey: 'war-room-spark',        baseAxis: 'war-room-spark' },
  { axisKey: 'war-room-formation',    baseAxis: 'war-room-formation' },
  { axisKey: 'ceo-decisions-capture', baseAxis: 'ceo-decisions-capture' },
  ...(['direction', 'board', 'coord', 'team', 'ext', 'self'] as const).map((prismId) => ({
    axisKey: `balcony-prompt/${prismId}`,
    baseAxis: 'balcony-prompt',
    suffix: prismId,
  })),
];

// boardroom-annotation expertId → expertName
const ANNOTATION_EXPERTS: Record<string, string> = {
  'lp-coach-v1':     '沈南鹏 · LP 关系教练',
  'wei-rubric':      '马斯克 · 估值锚定 rubric',
  'omar-cycle':      '张一鸣 · 周期判断教练',
  'sara-compliance': '任正非 · 合规备案教练',
};

const BALCONY_QUESTIONS: Record<string, string> = {
  direction: '本周你把时间花在战略主线上了吗？',
  board:     '下次董事会你最该带去的那个事是什么？',
  coord:     '哪一条承诺你今晚最怕被问起？',
  team:      '你的 No.2 这周和你说的最重要的一句话是什么？',
  ext:       '哪一类外部信号你这周躲开了，没正视？',
  self:      '本周你做的最满意 / 最遗憾的一个决定？',
};

interface ExecResult { axisKey: string; ok: boolean; error?: string; ms: number }

async function main() {
  const args = process.argv.slice(2);
  const wsSlug = args.find((a) => a.startsWith('--workspace='))?.slice('--workspace='.length) ?? 'default';
  const scopeName = args.find((a) => a.startsWith('--scope='))?.slice('--scope='.length) ?? null;
  const dryRun = args.includes('--dry-run');
  const skipDerived = args.includes('--skip-derived');
  const claudeBin = args.find((a) => a.startsWith('--claude-bin='))?.slice('--claude-bin='.length) ?? 'claude';
  const claudeModel = args.find((a) => a.startsWith('--model='))?.slice('--model='.length);
  const timeoutMs = Number(args.find((a) => a.startsWith('--timeout='))?.slice('--timeout='.length) ?? 600_000);

  const { query, ensureDbPoolConnected } = await import('../db/connection.js');
  const { PROMPTS, loadPromptCtx } = await import('../modules/ceo/prompts/index.js');
  const { PROMPT_HANDLERS } = await import('../modules/ceo/pipelines/promptHandlers.js');
  const { handleCeoRun } = await import('../modules/ceo/pipelines/runHandlers.js');
  const { createCeoPipelineDeps } = await import('../modules/ceo/adapters/pipeline.js');
  const { aggregateAttentionAlloc } = await import('../modules/ceo/aggregators/attention-alloc.js');
  const { aggregateTimeRoi } = await import('../modules/ceo/aggregators/time-roi.js');

  await ensureDbPoolConnected();

  // ─── 1. 解析 ws + scope ─────────────────────────────────────
  const wsRow = await query(`SELECT id::text FROM workspaces WHERE slug = $1 LIMIT 1`, [wsSlug]);
  if (!wsRow.rows[0]) throw new Error(`workspace slug='${wsSlug}' 未找到`);
  const wsId = String(wsRow.rows[0].id);

  const scopeWhere = scopeName
    ? { sql: `AND s.name = $2`, args: [scopeName] }
    : { sql: `AND s.kind = 'project'`, args: [] };
  const scopeRow = await query(
    `SELECT s.id::text, s.name FROM mn_scopes s
      WHERE s.workspace_id = $1::uuid AND s.status = 'active' ${scopeWhere.sql}
      ORDER BY s.created_at DESC LIMIT 1`,
    [wsId, ...scopeWhere.args],
  );
  if (!scopeRow.rows[0]) throw new Error(`scope${scopeName ? ` name='${scopeName}'` : ''} 在 ws='${wsSlug}' 下未找到`);
  const scope = { id: String(scopeRow.rows[0].id), name: String(scopeRow.rows[0].name) };

  console.log(`[all-in-one] workspace=${wsSlug} scope=${scope.name} (id=${scope.id.slice(0, 8)}…)`);

  // ─── 2. 加载 ctx (一次性, 共享给所有 axis) ─────────────────
  const dbHandle = { query: (sql: string, params?: any[]) => query(sql, params) };
  // runId 仅用于 ctx 内部 metadata,不影响 prompt 内容; 用临时 uuid
  const tmpRunId = (await query(`SELECT gen_random_uuid()::text AS id`)).rows[0].id as string;
  const ctx = await loadPromptCtx(dbHandle, { scopeId: scope.id, runId: tmpRunId });
  console.log(
    `[all-in-one] ctx loaded: meetings=${ctx.meetings.length}, judgments=${ctx.judgments.length}, ` +
    `commitments=${ctx.commitments.length}, directors=${ctx.directors.length}, ` +
    `stakeholders=${ctx.stakeholders.length}, strategicLines=${ctx.strategicLines.length}, ` +
    `counterfactuals=${ctx.counterfactuals.length}`,
  );

  // ─── 3. 拼 mega-prompt ──────────────────────────────────────
  const megaPrompt = buildMegaPrompt(ctx, ALL_AXES_LIST, PROMPTS);
  console.log(`[all-in-one] mega-prompt 字符数 = ${megaPrompt.length}`);

  if (dryRun) {
    console.log('--- mega-prompt (前 4000 字) ---');
    console.log(megaPrompt.slice(0, 4000));
    console.log(`...... (truncated, 全长 ${megaPrompt.length} 字)`);
    process.exit(0);
  }

  // ─── 4. 调 claude CLI 一次 ─────────────────────────────────
  const t0 = Date.now();
  const megaResultStr = await callClaudeCliOnce(megaPrompt, { binPath: claudeBin, model: claudeModel, timeoutMs });
  const callMs = Date.now() - t0;
  console.log(`[all-in-one] claude CLI 返回 (${(callMs / 1000).toFixed(1)}s, ${megaResultStr.length} 字符)`);

  let megaResult: Record<string, unknown>;
  try {
    megaResult = JSON.parse(megaResultStr);
  } catch (e) {
    // 尝试从字符串中找 JSON 块
    const m = megaResultStr.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`mega result 无法 parse 为 JSON: ${megaResultStr.slice(0, 300)}`);
    megaResult = JSON.parse(m[0]);
  }
  const gotKeys = Object.keys(megaResult);
  const missingKeys = ALL_AXES_LIST.map((a) => a.axisKey).filter((k) => !(k in megaResult));
  console.log(`[all-in-one] 解出 ${gotKeys.length} axis keys; 缺失 ${missingKeys.length}: ${missingKeys.slice(0, 5).join(', ')}${missingKeys.length > 5 ? '...' : ''}`);

  // ─── 5. 注入 MegaResultAdapter,跑每个 handler ──────────────
  const llm = new MegaResultAdapter(megaResult);
  const ceoDeps = createCeoPipelineDeps({ dbQuery: (sql, params) => query(sql, params), llm });

  const results: ExecResult[] = [];
  for (const item of ALL_AXES_LIST) {
    const t0 = Date.now();
    const handler = PROMPT_HANDLERS[item.baseAxis];
    if (!handler) {
      results.push({ axisKey: item.axisKey, ok: false, ms: 0, error: `no handler for ${item.baseAxis}` });
      console.log(`[all-in-one] ✗ ${item.axisKey} — no handler`);
      continue;
    }
    if (!(item.axisKey in megaResult)) {
      results.push({ axisKey: item.axisKey, ok: false, ms: 0, error: 'mega result 中缺失该 axis' });
      console.log(`[all-in-one] ✗ ${item.axisKey} — missing in mega result`);
      continue;
    }

    const runId = (await query(`SELECT gen_random_uuid()::text AS id`)).rows[0].id as string;
    const metadata: Record<string, any> = {};
    if (item.baseAxis === 'boardroom-annotation') {
      metadata.expertId = item.suffix;
      metadata.expertName = ANNOTATION_EXPERTS[item.suffix ?? ''] ?? item.suffix;
    } else if (item.baseAxis === 'balcony-prompt') {
      metadata.userId = 'system';
      metadata.weekStart = nextSundayStart();
      metadata.prismId = item.suffix;
      // 提前 ensure ceo_balcony_reflections 行存在 (handler 会 UPDATE)
      const wsId2 = wsId;
      await query(
        `INSERT INTO ceo_balcony_reflections (user_id, week_start, prism_id, question, workspace_id)
         VALUES ($1, $2::date, $3, $4, $5::uuid)
         ON CONFLICT (user_id, week_start, prism_id) DO NOTHING`,
        [metadata.userId, metadata.weekStart, metadata.prismId, BALCONY_QUESTIONS[metadata.prismId] ?? '?', wsId2],
      );
    }
    // 让 MegaResultAdapter 在 handler invokeAndValidate 中根据 axisKey 找到对应 payload
    llm.setCurrentAxis(item.axisKey);

    const run = {
      id: runId,
      axis: item.baseAxis,
      scope_kind: 'project' as const,
      scope_id: scope.id,
      workspace_id: wsId,
      metadata,
    };
    try {
      const r = await handler(ceoDeps, run as any);
      const ms = Date.now() - t0;
      if (r.ok) {
        results.push({ axisKey: item.axisKey, ok: true, ms });
        console.log(`[all-in-one] ✓ ${item.axisKey} (${ms}ms)`);
      } else {
        results.push({ axisKey: item.axisKey, ok: false, ms, error: r.error });
        console.log(`[all-in-one] ✗ ${item.axisKey} — ${(r.error ?? '').slice(0, 200)}`);
      }
    } catch (e) {
      const ms = Date.now() - t0;
      results.push({ axisKey: item.axisKey, ok: false, ms, error: (e as Error).message });
      console.log(`[all-in-one] ✗ ${item.axisKey} — exception: ${(e as Error).message.slice(0, 200)}`);
    }
  }

  // ─── 6. 派生计算 (不走 LLM) ────────────────────────────────
  if (!skipDerived) {
    console.log('\n[all-in-one] 派生计算 (fast, 不走 LLM):');
    try {
      await aggregateAttentionAlloc(ceoDeps, scope.id);
      console.log('  ✓ tower-attention-alloc (aggregated)');
    } catch (e) { console.log(`  ✗ tower-attention-alloc: ${(e as Error).message}`); }
    try {
      await aggregateTimeRoi(ceoDeps, 'system', wsId);
      console.log('  ✓ balcony-time-roi (aggregated)');
    } catch (e) { console.log(`  ✗ balcony-time-roi: ${(e as Error).message}`); }
    try {
      const runId = (await query(`SELECT gen_random_uuid()::text AS id`)).rows[0].id as string;
      const r = await handleCeoRun(ceoDeps, {
        id: runId, axis: 'panorama-aggregate', scope_kind: 'project',
        scope_id: scope.id, workspace_id: wsId, metadata: {},
      } as any);
      if (r.ok) console.log('  ✓ panorama-aggregate');
      else console.log(`  ✗ panorama-aggregate: ${r.error}`);
    } catch (e) { console.log(`  ✗ panorama-aggregate: ${(e as Error).message}`); }
  }

  // ─── 7. 总结 ────────────────────────────────────────────────
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n────────── SUMMARY ──────────`);
  console.log(`total: ${results.length}, ok: ${ok}, failed: ${failed.length}, claude_cli_call: ${(callMs / 1000).toFixed(1)}s`);
  if (failed.length > 0) {
    console.log('\nFailed axes:');
    for (const f of failed) console.log(`  - ${f.axisKey}: ${(f.error ?? '').slice(0, 200)}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

// ─── helpers ────────────────────────────────────────────────────────

function nextSundayStart(): string {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0=Sun
  d.setDate(d.getDate() + (7 - dayOfWeek) % 7);
  return d.toISOString().slice(0, 10);
}

/**
 * 拼装 mega-prompt: 共享 CONTEXT 块 + 各 axis 系统 prompt + 输出格式声明
 *
 * 关键决策:
 *   - ctx 一次性输出 (避免每个 axis userPrompt 重复)
 *   - 每个 axis 段只 emit systemPrompt (含 schema + quality + hard constraints)
 *   - 输出 schema 自描述 — 让 LLM 按顶层 axisKey 输出 JSON
 */
function buildMegaPrompt(
  ctx: any, // PromptCtx
  axesList: typeof ALL_AXES_LIST,
  prompts: Record<string, any>,
): string {
  const parts: string[] = [];
  parts.push(`# CEO 决策套件总生成器 — ONE-SHOT MODE\n\n你是上海惠居 CEO 决策套件总生成器。一次性产出 ${axesList.length} 个独立 axis 的 JSON 内容,严格按下方"共享 CONTEXT" + 各 axis 要求。\n\n## 输出形态 (顶层 JSON, 严格按下面 axis key 列表)\n\n严格输出 1 个 JSON object,顶层 key 是 axis key (含 / 子路径), value 是该 axis 对应的 schema payload。**不要任何前后说明文字**,只输出 JSON。\n\n顶层 keys 列表:`);
  parts.push(axesList.map((a) => `  "${a.axisKey}"`).join(',\n'));

  // ─── 共享 CONTEXT ─────────────────────
  parts.push(`\n\n## 共享 CONTEXT (所有 axis 都基于这份数据)\n`);
  parts.push(`Scope: ${ctx.scopeName ?? '(未命名)'}`);
  parts.push(`\nDirectors (${ctx.directors.length}):\n${ctx.directors.map((d: any) => `- ${d.name} (${d.role ?? '?'}, weight=${d.weight})`).join('\n')}`);
  parts.push(`\nStakeholders (${ctx.stakeholders.length}):\n${ctx.stakeholders.map((s: any) => `- ${s.name} (kind=${s.kind}, heat=${s.heat})${s.description ? ' · ' + s.description : ''}`).join('\n')}`);
  parts.push(`\nStrategic Lines (${ctx.strategicLines.length}):\n${ctx.strategicLines.map((l: any) => `- [${l.id}] ${l.name} (${l.kind}, align=${l.alignmentScore ?? '?'}): ${(l.description ?? '').slice(0, 120)}`).join('\n')}`);

  if (ctx.counterfactuals.length > 0) {
    parts.push(`\n待回看反事实 (${ctx.counterfactuals.length}):\n${ctx.counterfactuals.slice(0, 8).map((c: any) => `- [${c.currentValidity} | next_check: ${c.nextCheckAt ? new Date(c.nextCheckAt).toISOString().slice(0, 10) : '未设'}] ${c.rejectedPath.slice(0, 140)}`).join('\n')}`);
  }
  parts.push(`\nMeetings (${ctx.meetings.length}):\n${ctx.meetings.slice(0, 12).map((m: any) => `- [${m.id}] ${m.title}`).join('\n')}`);
  parts.push(`\n近 90 天 Judgments (${ctx.judgments.length}):\n${ctx.judgments.slice(0, 30).map((j: any) => `- [${j.kind}] ${j.text.slice(0, 120)}`).join('\n')}`);
  parts.push(`\n近 90 天 Commitments (${ctx.commitments.length}):\n${ctx.commitments.slice(0, 12).map((c: any) => `- [${c.status}] ${c.text.slice(0, 110)}${c.dueAt ? ` (due ${c.dueAt.slice(0, 10)})` : ''}${c.ownerName ? ` owner=${c.ownerName}` : ''}`).join('\n')}`);

  if (ctx.conceptDrifts && ctx.conceptDrifts.length > 0) {
    parts.push(`\n概念漂移术语 (${ctx.conceptDrifts.length}):\n${ctx.conceptDrifts.slice(0, 6).map((d: any) => {
      const head = `- [${d.severity}] ${d.term} (usage=${d.usageCount}, misuse=${d.misuseCount})`;
      const cases = d.usages.slice(0, 2).map((u: any) => `    ${u.correctlyUsed ? '✓' : '✗'} ${u.outcome.slice(0, 100)}`).join('\n');
      return head + '\n' + cases;
    }).join('\n')}`);
  }
  if (ctx.brief) {
    parts.push(`\nDraft Brief: ${ctx.brief.boardSession ?? '?'} v${ctx.brief.version} (id=${ctx.brief.id?.slice(0, 8)}…)`);
  }

  // ─── 各 axis 系统 prompt + 子任务 hint ──────────────────
  parts.push(`\n\n## 各 axis 详细要求 (按下方 schema 输出对应 payload)\n`);
  for (const item of axesList) {
    parts.push(`\n=== AXIS: ${item.axisKey} ===\n`);
    const def = prompts[item.baseAxis];
    if (!def) {
      parts.push(`(未找到 prompt def for ${item.baseAxis})`);
      continue;
    }
    parts.push(def.systemPrompt());
    if (item.baseAxis === 'boardroom-annotation' && item.suffix) {
      parts.push(`\n[当前 expert: expertId="${item.suffix}", expertName="${ANNOTATION_EXPERTS[item.suffix] ?? item.suffix}". 输出该 expert 视角的单条 annotation, 顶层 axis key 为 "${item.axisKey}".]`);
    }
    if (item.baseAxis === 'balcony-prompt' && item.suffix) {
      parts.push(`\n[当前 prism: prismId="${item.suffix}" (问题: "${BALCONY_QUESTIONS[item.suffix] ?? '?'}"). 顶层 axis key 为 "${item.axisKey}".]`);
    }
  }

  parts.push(`\n\n## 最终输出\n\n严格按 JSON, 不要任何 markdown 包装, 不要前后说明:\n\n{\n  "compass-stars": { ... },\n  ...全部 ${axesList.length} axes...\n}`);
  return parts.join('\n');
}

/**
 * 调 claude CLI 一次, 返回 outer.result (mega JSON 字符串)
 */
async function callClaudeCliOnce(
  prompt: string,
  opts: { binPath?: string; model?: string; timeoutMs?: number } = {},
): Promise<string> {
  const binPath = opts.binPath ?? 'claude';
  const args = ['-p', '--output-format', 'json', '--max-turns', '1'];
  if (opts.model) args.push('--model', opts.model);
  const timeoutMs = opts.timeoutMs ?? 600_000;

  return new Promise((resolveP, rejectP) => {
    const proc = spawn(binPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        rejectP(new Error(`claude CLI exit=${code}; stderr=${stderr.slice(0, 500)}`));
        return;
      }
      try {
        const outer = JSON.parse(stdout);
        if (outer.is_error) {
          rejectP(new Error(`claude CLI is_error=true; result=${(outer.result ?? '').slice(0, 300)}`));
          return;
        }
        resolveP(String(outer.result ?? ''));
      } catch (e) {
        rejectP(new Error(`claude CLI outer JSON parse failed: ${(e as Error).message}; stdout head=${stdout.slice(0, 200)}`));
      }
    });
    proc.on('error', (e) => {
      clearTimeout(killTimer);
      rejectP(new Error(`claude CLI spawn 失败: ${e.message}`));
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/**
 * Mock LLM Adapter — 不调真 LLM, 而是从预先 parse 的 megaResult 中取对应 axis 的 payload
 *
 * 如何拿到 axis name: 主流程在每次调 handler 之前用 setCurrentAxis 提示当前 axis key.
 * handler 内部 invokeAndValidate 会调 deps.llm.invoke(input), input.taskTag 通常是 axis 名,
 * 但子任务展开 (如 boardroom-annotation/lp-coach-v1) handler 自己不知道 suffix.
 * 所以用 currentAxis 状态变量做 lookup.
 */
class MegaResultAdapter {
  private currentAxis = '';
  constructor(private megaResult: Record<string, unknown>) {}

  isAvailable(): boolean { return true; }

  setCurrentAxis(axisKey: string): void { this.currentAxis = axisKey; }

  async invoke(_input: { prompt: string; system?: string; taskTag?: string }) {
    const key = this.currentAxis;
    const payload = this.megaResult[key];
    if (payload === undefined) {
      throw new Error(`MegaResultAdapter: axis "${key}" 在 mega result 中缺失`);
    }
    return {
      text: JSON.stringify(payload),
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 0,
      model: 'all-in-one-megacli',
    };
  }
}

main().catch((e) => {
  console.error('[all-in-one] failed:', e);
  process.exit(1);
});

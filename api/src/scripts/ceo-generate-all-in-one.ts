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

// boardroom-annotation expertId → {expertName, profileId}
// profileId 指向 expert_profiles 表 — 知识库注入: 让 LLM 真的扮演该专家而非凭印象演
const ANNOTATION_EXPERTS: Record<string, { name: string; profileId: string }> = {
  'lp-coach-v1':     { name: '沈南鹏 · LP 关系教练',     profileId: 'S-11' },
  'wei-rubric':      { name: '马斯克 · 估值锚定 rubric', profileId: 'S-03' },
  'omar-cycle':      { name: '张一鸣 · 周期判断教练',    profileId: 'S-01' },
  'sara-compliance': { name: '任正非 · 合规备案教练',    profileId: 'S-06' },
};

// director name → expertProfileId mapping (上海惠居 AI 升级 5 位 director 全是 S 级专家)
const DIRECTOR_PROFILE_MAP: Record<string, string> = {
  '左晖':            'E08-08',  // 房地产/平台经济/服务品质/长期主义
  '张磊':            'S-12',    // 价值投资/长期投资/产业投资
  '王慧文':          'S-09',    // 竞争策略/互联网产品/执行力
  'Andrej Karpathy': 'S-40',    // AI/深度学习/LLM 评估/软件工程
  '林毅夫':          'S-15',    // 著名经济学家/产业政策/比较优势
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

  // ─── 2.5 知识库注入: 预查所有 director + expert 的 expert_profiles ──
  const profileIds = new Set<string>();
  for (const d of ctx.directors) {
    const pid = DIRECTOR_PROFILE_MAP[d.name];
    if (pid) profileIds.add(pid);
  }
  for (const e of Object.values(ANNOTATION_EXPERTS)) profileIds.add(e.profileId);
  const profilesById = await loadExpertProfiles(query, [...profileIds]);
  console.log(`[all-in-one] 知识库注入: ${Object.keys(profilesById).length}/${profileIds.size} 位专家档案 (${[...profileIds].join(', ')})`);

  // ─── 3. 拼 mega-prompt ──────────────────────────────────────
  const megaPrompt = buildMegaPrompt(ctx, ALL_AXES_LIST, PROMPTS, profilesById);
  console.log(`[all-in-one] mega-prompt 字符数 = ${megaPrompt.length}`);

  if (dryRun) {
    console.log('--- mega-prompt (前 4000 字) ---');
    console.log(megaPrompt.slice(0, 4000));
    console.log(`...... (truncated, 全长 ${megaPrompt.length} 字)`);
    process.exit(0);
  }

  // ─── 4. 调 claude CLI 一次 ─────────────────────────────────
  // --from-file=<path> 跳过 LLM 调用,直接 parse 已 dump 的 raw 文件 (debug 模式)
  const fromFile = args.find((a) => a.startsWith('--from-file='))?.slice('--from-file='.length);
  let megaResultStr: string;
  let callMs = 0;
  if (fromFile) {
    const fs = await import('node:fs');
    megaResultStr = fs.readFileSync(fromFile, 'utf8');
    console.log(`[all-in-one] 从文件读 mega JSON: ${fromFile} (${megaResultStr.length} 字符)`);
  } else {
    const t0 = Date.now();
    megaResultStr = await callClaudeCliOnce(megaPrompt, { binPath: claudeBin, model: claudeModel, timeoutMs });
    callMs = Date.now() - t0;
    console.log(`[all-in-one] claude CLI 返回 (${(callMs / 1000).toFixed(1)}s, ${megaResultStr.length} 字符)`);
    // 始终 dump 到 /tmp 供 debug (再跑就被覆盖, 但失败时 ok)
    try {
      const fs = await import('node:fs');
      const dumpPath = `/tmp/ceo-runs/all-in-one-mega-${Date.now()}.json.raw`;
      fs.writeFileSync(dumpPath, megaResultStr);
      console.log(`[all-in-one] mega raw 已 dump: ${dumpPath}`);
    } catch { /* ignore */ }
  }

  let megaResult: Record<string, unknown>;
  try {
    megaResult = JSON.parse(megaResultStr);
  } catch (e) {
    // 多策略容错解析
    const tries: Array<{ label: string; text: string }> = [];
    let cleaned = megaResultStr.trim();
    // 策略 1: 剥 markdown ```json ... ```
    if (cleaned.startsWith('```')) {
      const stripped = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      tries.push({ label: 'strip-markdown', text: stripped });
    }
    // 策略 2: 找最外层 {...}
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      tries.push({ label: 'first-last-brace', text: cleaned.slice(firstBrace, lastBrace + 1) });
    }
    // 策略 3: 转义 raw control chars (LLM 偶尔输出未转义换行/tab/cr)
    const ctrlStripped = cleaned.replace(/[\u0000-\u001f]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return ' ';
    });
    if (ctrlStripped !== cleaned) tries.push({ label: 'escape-ctrl', text: ctrlStripped });

    // 策略 4: LLM 常见错误 — 在 string value 内用 ASCII " 嵌套引用术语 (e.g. "应该把"瓶颈分析"用...")
    //   修法: 把中文字符 / 中文标点 前后的 ASCII " 替换为「」 (结构 quote 后接 letter/:/逗号 不被影响)
    const fenceStripped = cleaned.startsWith('```')
      ? cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
      : cleaned;
    const cnRange = '[一-鿿，。、；：！？]';                  // CJK + 中文标点
    const ccRange = '[一-鿿，。、；：！？0-9a-zA-Z]';           // + ASCII 字母数字
    const cnQuoted = fenceStripped
      .replace(new RegExp(`(${ccRange})"(${cnRange})`, 'g'), '$1」$2')
      .replace(new RegExp(`(${cnRange})"(${ccRange})`, 'g'), '$1「$2');
    if (cnQuoted !== fenceStripped) tries.push({ label: 'cn-quote-fix', text: cnQuoted });
    // 策略 5: cn-quote-fix + escape-ctrl 组合
    const combined = cnQuoted.replace(/[ -]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return ' ';
    });
    if (combined !== cnQuoted) tries.push({ label: 'cn-quote-fix+escape-ctrl', text: combined });

    // 策略 6: stateful escape — 状态机扫一遍, 在 string 内的 ASCII " escape 为 \"
    //   不依赖 char 类型, 兜底处理 "...嵌套"+...嵌套"..." 这种复杂情况
    const stateful = statefulEscapeNestedQuotes(fenceStripped);
    if (stateful !== fenceStripped) tries.push({ label: 'stateful-escape', text: stateful });
    const stateful2 = stateful.replace(/[ -]/g, (ch) => {
      if (ch === '\n') return '\\n';
      if (ch === '\r') return '\\r';
      if (ch === '\t') return '\\t';
      return ' ';
    });
    if (stateful2 !== stateful) tries.push({ label: 'stateful+escape-ctrl', text: stateful2 });

    let parsed: Record<string, unknown> | null = null;
    let lastErr: string = (e as Error).message;
    for (const t of tries) {
      try {
        parsed = JSON.parse(t.text);
        console.log(`[all-in-one] mega JSON 容错恢复: ${t.label} 成功 (${t.text.length} 字符)`);
        break;
      } catch (e2) { lastErr = `${t.label}: ${(e2 as Error).message}`; }
    }
    if (!parsed) {
      // 暴露错误位置上下文
      const pos = Number(((e as Error).message.match(/position (\d+)/) ?? [])[1] ?? 0);
      const ctx = megaResultStr.slice(Math.max(0, pos - 100), pos + 100);
      throw new Error(`mega result JSON parse 失败. last err: ${lastErr}\n  错误位置 ±100 字符:\n  ${ctx}`);
    }
    megaResult = parsed;
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
      const exp = ANNOTATION_EXPERTS[item.suffix ?? ''];
      metadata.expertId = item.suffix;
      metadata.expertName = exp?.name ?? item.suffix;
      // 知识库注入: 把 expert_profile 也喂给 handler
      if (exp?.profileId) metadata.expertProfile = profilesById[exp.profileId] ?? null;
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
  // 与 ceo-generate-real-content / balcony service.thisWeekStart 对齐: Monday-based.
  // 历史名字保留 nextSundayStart, 实际返回本周一. 之前用 next Sunday 写入,
  // service 默认 weekStart = 本周一查询, 不命中导致前端 Balcony 房间显示空.
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
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
/**
 * 知识库查询: 一次拿多位专家的 persona/method/signature_phrases
 */
async function loadExpertProfiles(
  query: any,
  profileIds: string[],
): Promise<Record<string, any>> {
  if (profileIds.length === 0) return {};
  try {
    const r = await query(
      `SELECT expert_id, name, persona, method, signature_phrases, anti_patterns
         FROM expert_profiles WHERE expert_id = ANY($1::text[]) AND is_active = true`,
      [profileIds],
    );
    const out: Record<string, any> = {};
    for (const row of r.rows) {
      out[row.expert_id] = {
        profileId: row.expert_id,
        name: row.name,
        persona: row.persona,
        method: row.method,
        signaturePhrases: row.signature_phrases,
        antiPatterns: row.anti_patterns,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function formatProfileBlock(p: any): string {
  if (!p) return '';
  const lines: string[] = [`  · ${p.name}`];
  if (p.persona?.bias?.length) lines.push(`    bias: ${p.persona.bias.slice(0, 3).join(' / ')}`);
  if (p.persona?.tone) lines.push(`    tone: ${String(p.persona.tone).slice(0, 100)}`);
  if (p.method?.frameworks?.length) lines.push(`    frameworks: ${p.method.frameworks.slice(0, 4).join(' / ')}`);
  if (p.signaturePhrases?.length) lines.push(`    signature: "${p.signaturePhrases.slice(0, 2).join('" / "')}"`);
  return lines.join('\n');
}

function buildMegaPrompt(
  ctx: any, // PromptCtx
  axesList: typeof ALL_AXES_LIST,
  prompts: Record<string, any>,
  profilesById: Record<string, any> = {},
): string {
  const parts: string[] = [];
  parts.push(`# CEO 决策套件总生成器 — ONE-SHOT MODE\n\n你是上海惠居 CEO 决策套件总生成器。一次性产出 ${axesList.length} 个独立 axis 的 JSON 内容,严格按下方"共享 CONTEXT" + 各 axis 要求。\n\n## 输出形态 (顶层 JSON, 严格按下面 axis key 列表)\n\n严格输出 1 个 JSON object,顶层 key 是 axis key (含 / 子路径), value 是该 axis 对应的 schema payload。**不要任何前后说明文字**,只输出 JSON。\n\n顶层 keys 列表:`);
  parts.push(axesList.map((a) => `  "${a.axisKey}"`).join(',\n'));

  // ─── 共享 CONTEXT ─────────────────────
  parts.push(`\n\n## 共享 CONTEXT (所有 axis 都基于这份数据)\n`);
  parts.push(`Scope: ${ctx.scopeName ?? '(未命名)'}`);
  parts.push(`\nDirectors (${ctx.directors.length}):\n${ctx.directors.map((d: any) => `- ${d.name} (${d.role ?? '?'}, weight=${d.weight})`).join('\n')}`);
  // 知识库注入: 给 directors 附 expert_profiles 真实档案
  const directorProfiles = ctx.directors
    .map((d: any) => profilesById[DIRECTOR_PROFILE_MAP[d.name] ?? ''] ?? null)
    .filter(Boolean);
  if (directorProfiles.length > 0) {
    parts.push(`\nDirector 真实档案 (来自专家库, 严格按下方风格扮演):\n${directorProfiles.map(formatProfileBlock).join('\n')}`);
  }
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
      const exp = ANNOTATION_EXPERTS[item.suffix];
      const profile = exp?.profileId ? profilesById[exp.profileId] : null;
      const profileText = profile ? `\n${formatProfileBlock(profile)}\n` : '';
      parts.push(`\n[当前 expert: expertId="${item.suffix}", expertName="${exp?.name ?? item.suffix}".${profileText}\n输出该 expert 视角的单条 annotation, 顶层 axis key 为 "${item.axisKey}". 必须按上方专家档案的 bias/tone/frameworks/signature 风格扮演。]`);
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

/**
 * 状态机扫一遍 JSON-like 字符串, 把 string value 内的 ASCII " escape 为 \"
 *
 * 启发式:
 *   - 跟踪 inString (是否在 "..." 之间)
 *   - 遇到未转义的 " 时, 看下一个非空白字符:
 *       是 , : } ] (或 EOF) → 这个 " 是结构 quote (string close), inString=false
 *       否则 → 这个 " 在 value 内, 替换为 \"
 *   - 启动 string 时 inString=true (当不在 string 时遇到 ")
 *
 * 不完美但对 LLM 输出"应该把"瓶颈分析"用..."这种模式有效.
 */
function statefulEscapeNestedQuotes(s: string): string {
  let out = '';
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escapeNext) {
      out += c;
      escapeNext = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      escapeNext = true;
      continue;
    }
    if (c === '"') {
      if (!inString) {
        // 进入 string
        out += c;
        inString = true;
      } else {
        // 看下一个非空白字符判断是结构边界还是嵌套 quote
        let j = i + 1;
        while (j < s.length && (s[j] === ' ' || s[j] === '\t' || s[j] === '\n' || s[j] === '\r')) j++;
        const nxt = s[j];
        if (j >= s.length || nxt === ',' || nxt === ':' || nxt === '}' || nxt === ']') {
          // 结构 quote - string 结束
          out += c;
          inString = false;
        } else {
          // 嵌套 quote, escape it
          out += '\\"';
        }
      }
    } else {
      out += c;
    }
  }
  return out;
}

main().catch((e) => {
  console.error('[all-in-one] failed:', e);
  process.exit(1);
});

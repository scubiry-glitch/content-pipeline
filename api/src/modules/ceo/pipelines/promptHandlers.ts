// CEO 棱镜 prompt handlers — 用 prompts/ 模块跑 LLM 并写表
//
// 与 runHandlers.ts 老 stub-fallback 路径并存：
//   - 老 axis (g1..g5, compass-echo legacy 等) 走 runHandlers.ts 现有 inline prompt
//   - 新 axis (compass-stars, boardroom-rebuttal, ...) 走这里 — 严格 schema + 质量校验
//
// 设计要点：
//   1. 没 LLM → 直接返回 ok:false (不写 stub 数据，避免污染前端展示层)
//      —— 老 handler 的 "stub 兜底" 是为了让 UI 不崩；这里 axis 全是新增，前端有
//         空状态判断，可以坦然让 LLM 缺位时跳过。
//   2. 输出 zod 严格校验 + 质量校验任一不过 → throw → handler 返回 ok:false
//      → mn_runs.state = 'failed'，error_message 含原因。

import type { CeoEngineDeps, CeoLLMInvokeResult } from '../types.js';
import { PROMPTS, loadPromptCtx, type PromptCtx, type PromptDef } from '../prompts/index.js';

export interface PromptRunRow {
  id: string;
  axis: string;
  scope_kind: string;
  scope_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface HandlerResult {
  ok: boolean;
  result?: any;
  error?: string;
}

/** 给所有 prompt 的 system 末尾追加的 JSON 输出硬规则
 *
 * 历史教训：claude-cli 输出的 JSON 字符串值里经常出现未转义的 ASCII " 或裸 `\n`，
 * 比如 `"highlight":"美租 IRR 模型"风险敞口"虚高"` 直接打断 JSON.parse。
 * 用中文 「」 / "" / 全角引号能完全避开此类问题。
 */
const JSON_ESCAPE_RULE = `
[输出硬规则]
- 仅输出一个 JSON 对象，不要前后任何说明文字、不要 markdown 代码围栏。
- JSON 字符串值内部禁止出现裸 ASCII 双引号 (")。需要引用时用中文「」或""""。
- 字符串值内部不出现真实换行符；用 \\n 转义或改成单行。
- 仅引用我提供列表中的 ID/名字，不可编造任何 UUID/人名/会议名。
- 仅输出 JSON, 输出完毕直接结束（不要 "以下是 JSON：" 前导文字）。
`;

/** 通用 LLM 调用 + 校验流水线 */
async function invokeAndValidate<T>(
  deps: CeoEngineDeps,
  def: PromptDef<T>,
  ctx: PromptCtx,
  runId: string,
): Promise<{ ok: true; out: T; result: CeoLLMInvokeResult } | { ok: false; error: string }> {
  if (!deps.llm?.isAvailable()) {
    return { ok: false, error: '[LLM] 未配置 (设置 CLAUDE_API_KEY/KIMI_API_KEY/OPENAI_API_KEY 任一)' };
  }
  let result: CeoLLMInvokeResult;
  try {
    result = await deps.llm.invoke({
      system: def.systemPrompt(ctx) + JSON_ESCAPE_RULE,
      prompt: def.userPrompt(ctx),
      responseFormat: 'json',
      maxTokens: def.maxTokens ?? 1500,
      temperature: def.temperature ?? 0.6,
      taskTag: def.axis,
    });
  } catch (e) {
    return { ok: false, error: `[LLM invoke] ${(e as Error).message}` };
  }
  // 记 cost
  await recordLlmCost(deps, runId, result);

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(result.text));
  } catch (e) {
    // 兜底：尝试把字符串值内裸 ASCII " 自动改成 "（无侵入修复 LLM 漏转义）
    try {
      parsed = JSON.parse(autoFixUnescapedQuotes(stripCodeFence(result.text)));
    } catch (e2) {
      return { ok: false, error: `[LLM 输出非 JSON] ${(e as Error).message}; head=${result.text.slice(0, 200)}` };
    }
  }
  let out: T;
  try {
    out = def.outputSchema.parse(parsed);
  } catch (e) {
    return { ok: false, error: `[zod 校验] ${(e as Error).message}` };
  }
  for (const check of def.qualityChecks) {
    const err = check(out, ctx);
    if (err) return { ok: false, error: `[quality] ${err}` };
  }
  return { ok: true, out, result };
}

/**
 * 兜底修复：把 JSON 字符串值内部裸 ASCII " 改成 "（U+201C）。
 * 简单状态机扫描：跟踪当前是否在字符串里，遇到 " 时若它后面紧跟 , } ] : " 才算结尾，
 * 否则视为字符串内的引号字符并替换为 "。仅修复一次，失败直接抛回原 JSON 错。
 */
function autoFixUnescapedQuotes(s: string): string {
  const out: string[] = [];
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inStr) {
      out.push(ch);
      if (ch === '"') inStr = true;
      continue;
    }
    if (escape) { out.push(ch); escape = false; continue; }
    if (ch === '\\') { out.push(ch); escape = true; continue; }
    if (ch === '"') {
      // 看下个非空白字符是否为 JSON 结构符
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      const next = s[j] ?? '';
      if (next === ',' || next === '}' || next === ']' || next === ':' || next === '') {
        out.push(ch);
        inStr = false;
      } else {
        // 视为字符串内裸引号 → 改成中文引号
        out.push('"');
      }
      continue;
    }
    out.push(ch);
  }
  return out.join('');
}

/** 去掉 LLM 偶尔输出的 ```json ... ``` 代码围栏（含前后空白与换行）+ 容错抓最长 JSON 子串 */
function stripCodeFence(s: string): string {
  let t = s.trim();
  // claude -p 经常输出: 前导文字 + ```json\n{...}\n``` + 后续文字
  // 优先匹配围栏内内容
  const fenced = t.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenced && fenced[1]) {
    t = fenced[1].trim();
  } else {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  // 仍以非 { 开头时，截到第一个 { 之后最长的平衡 JSON
  if (!t.startsWith('{') && !t.startsWith('[')) {
    const i = t.indexOf('{');
    if (i >= 0) t = t.slice(i);
  }
  return t.trim();
}

function inferProvider(model?: string): string {
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  if (m.includes('claude')) return 'claude';
  if (m.includes('kimi') || m.includes('moonshot')) return 'kimi';
  if (m.includes('gpt') || m.includes('o1') || m.includes('openai')) return 'openai';
  return model;
}

async function recordLlmCost(
  deps: CeoEngineDeps,
  runId: string,
  result: CeoLLMInvokeResult,
): Promise<void> {
  const tokens = (result.tokensIn ?? 0) + (result.tokensOut ?? 0);
  const provider = inferProvider(result.model);
  try {
    await deps.db.query(
      `UPDATE mn_runs
          SET cost_tokens = COALESCE(cost_tokens, 0) + $2::int,
              cost_ms     = COALESCE(cost_ms, 0) + $3::int,
              metadata    = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'llmCalls', COALESCE((metadata->>'llmCalls')::int, 0) + 1,
                'llmProvider', $4::text,
                'llmModel', $5::text
              )
        WHERE id = $1::uuid`,
      [runId, tokens, result.durationMs ?? 0, provider, result.model ?? null],
    );
  } catch (e) {
    console.warn('[recordLlmCost] failed:', (e as Error).message);
  }
}

// ────────────────────────────────────────────────────────────────
// 各 axis 的 handler — 调 invokeAndValidate + 写自己的表
// ────────────────────────────────────────────────────────────────

/** compass-stars → ceo_strategic_lines */
export async function handleCompassStars(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['compass-stars'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const inserted: string[] = [];
  for (const star of r.out.stars) {
    const ins = await deps.db.query(
      `INSERT INTO ceo_strategic_lines (scope_id, name, kind, alignment_score, description)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id::text`,
      [run.scope_id, star.name, star.kind, star.alignment_score, star.description],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length, ids: inserted } };
}

/** compass-drift-alert → ceo_strategic_echos (fate=refute) */
export async function handleCompassDriftAlert(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['compass-drift-alert'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  if (ctx.strategicLines.length === 0) {
    return { ok: false, error: '无战略线 — 先跑 compass-stars' };
  }
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const validLineIds = new Set(ctx.strategicLines.map((l) => l.id));
  const inserted: string[] = [];
  const skipped: string[] = [];
  for (const a of r.out.alerts) {
    if (!validLineIds.has(a.line_id)) {
      skipped.push(`${a.line_name}(line_id 不存在: ${a.line_id})`);
      continue;
    }
    const sourceMeetingUuid = isUuid(a.source_meeting_id) ? a.source_meeting_id : null;
    const ins = await deps.db.query(
      `INSERT INTO ceo_strategic_echos (line_id, hypothesis_text, fact_text, fate, source_meeting_id, evidence_run_ids)
       VALUES ($1::uuid, $2, $3, 'refute', $4::uuid, ARRAY[$5]::text[])
       RETURNING id::text`,
      [a.line_id, a.hypothesis_text, a.fact_text, sourceMeetingUuid, run.id],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  if (inserted.length === 0 && skipped.length > 0) {
    return { ok: false, error: `所有 alerts 的 line_id 都无效: ${skipped.join('; ')}` };
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length, skipped: skipped.length } };
}

/** compass-echo → ceo_strategic_echos (batch) */
export async function handleCompassEcho(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['compass-echo'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  if (ctx.strategicLines.length === 0) {
    return { ok: false, error: '无战略线 — 先跑 compass-stars' };
  }
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const inserted: string[] = [];
  for (const e of r.out.echos) {
    const sourceMeetingUuid = isUuid(e.source_meeting_id) ? e.source_meeting_id : null;
    const ins = await deps.db.query(
      `INSERT INTO ceo_strategic_echos (line_id, hypothesis_text, fact_text, fate, source_meeting_id, evidence_run_ids)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, ARRAY[$6]::text[])
       RETURNING id::text`,
      [e.line_id, e.hypothesis_text, e.fact_text, e.fate, sourceMeetingUuid, run.id],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length, ids: inserted } };
}

/** boardroom-rebuttal → ceo_rebuttal_rehearsals (batch 2-5 条) */
export async function handleBoardroomRebuttal(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['boardroom-rebuttal'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  if (ctx.directors.length === 0) {
    return { ok: false, error: '无 ceo_directors — 先 seed' };
  }
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const briefId = ctx.brief?.id ?? null;
  const inserted: string[] = [];
  for (const reb of r.out.rebuttals) {
    const role = reb.attacker_role ?? '董事';
    const attackerLabel = `${reb.attacker_name}(${role})`;
    const score = reb.strength_score ?? 0.6;
    const ins = await deps.db.query(
      `INSERT INTO ceo_rebuttal_rehearsals
         (brief_id, scope_id, attacker, attack_text, defense_text, strength_score, generated_run_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
       RETURNING id::text`,
      [briefId, run.scope_id, attackerLabel, reb.attack_text, reb.defense_text, score, run.id],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length, ids: inserted } };
}

/** boardroom-annotation → ceo_boardroom_annotations (单条 per expert) */
export async function handleBoardroomAnnotation(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['boardroom-annotation'];
  const meta = run.metadata ?? {};
  const expertId = meta.expertId as string | undefined;
  const expertName = meta.expertName as string | undefined;
  if (!expertId || !expertName) {
    return { ok: false, error: 'metadata.expertId / expertName 必填' };
  }
  const ctx = await loadPromptCtx(deps.db, {
    scopeId: run.scope_id,
    runId: run.id,
    extra: { expertId, expertName, contextHint: meta.contextHint },
  });
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const briefId = ctx.brief?.id ?? null;
  const ins = await deps.db.query(
    `INSERT INTO ceo_boardroom_annotations
       (brief_id, scope_id, expert_id, expert_name, mode, highlight, body_md, citations, generated_run_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9)
     RETURNING id::text`,
    [briefId, run.scope_id, expertId, expertName, r.out.mode, r.out.highlight, r.out.body_md, JSON.stringify(r.out.citations), run.id],
  );
  return { ok: true, result: { mode: 'llm', annotationId: String(ins.rows[0]?.id) } };
}

/** boardroom-concerns → ceo_director_concerns */
export async function handleBoardroomConcerns(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['boardroom-concerns'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  if (ctx.directors.length === 0) {
    return { ok: false, error: '无 ceo_directors — 先 seed' };
  }
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const inserted: string[] = [];
  for (const c of r.out.concerns) {
    const sourceMeetingUuid = isUuid(c.source_meeting_id) ? c.source_meeting_id : null;
    const ins = await deps.db.query(
      `INSERT INTO ceo_director_concerns
         (director_id, topic, status, raised_count, source_meeting_id)
       VALUES ($1::uuid, $2, 'pending', $3, $4::uuid)
       RETURNING id::text`,
      [c.director_id, c.topic, c.raised_count, sourceMeetingUuid],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length } };
}

/** situation-signal → ceo_external_signals */
export async function handleSituationSignal(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['situation-signal'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  if (ctx.stakeholders.length === 0) {
    return { ok: false, error: '无 ceo_stakeholders — 先 seed' };
  }
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const inserted: string[] = [];
  for (const s of r.out.signals) {
    const ins = await deps.db.query(
      `INSERT INTO ceo_external_signals
         (stakeholder_id, signal_text, source_url, sentiment, ref_asset_id)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id::text`,
      [s.stakeholder_id, s.signal_text, s.source_url, s.sentiment, s.ref_asset_id],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length } };
}

/** situation-rubric → ceo_rubric_scores (5 条 dim 一次写) */
export async function handleSituationRubric(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['situation-rubric'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const stakeholderId = (run.metadata?.stakeholderId as string | undefined) ?? null;
  for (const s of r.out.scores) {
    await deps.db.query(
      `INSERT INTO ceo_rubric_scores
         (scope_id, stakeholder_id, dimension, score, evidence_run_id, evidence_text)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)`,
      [run.scope_id, stakeholderId, s.dimension, s.score, run.id, s.evidence_text],
    );
  }
  return { ok: true, result: { mode: 'llm', dimensions: r.out.scores.length } };
}

/** balcony-prompt → 更新 ceo_balcony_reflections.prompt */
export async function handleBalconyPrompt(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['balcony-prompt'];
  const meta = run.metadata ?? {};
  const userId = (meta.userId as string | undefined) ?? 'system';
  const weekStart = meta.weekStart as string | undefined;
  const prismId = meta.prismId as string | undefined;
  if (!weekStart || !prismId) {
    return { ok: false, error: 'metadata.weekStart / prismId 必填' };
  }
  const reflectionRes = await deps.db.query(
    `SELECT id::text AS id, question FROM ceo_balcony_reflections
      WHERE user_id = $1 AND week_start = $2 AND prism_id = $3 LIMIT 1`,
    [userId, weekStart, prismId],
  );
  const reflection = reflectionRes.rows[0];
  if (!reflection) {
    return { ok: false, error: 'reflection 行不存在' };
  }
  const ctx = await loadPromptCtx(deps.db, {
    scopeId: run.scope_id,
    runId: run.id,
    extra: { question: reflection.question, prismId, weekStart },
  });
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  await deps.db.query(
    `UPDATE ceo_balcony_reflections SET prompt = $1, generated_run_id = $2 WHERE id = $3::uuid`,
    [r.out.prompt_text, run.id, reflection.id],
  );
  return { ok: true, result: { mode: 'llm', reflectionId: reflection.id } };
}

/** war-room-spark → ceo_war_room_sparks */
export async function handleWarRoomSpark(deps: CeoEngineDeps, run: PromptRunRow): Promise<HandlerResult> {
  const def = PROMPTS['war-room-spark'];
  const ctx = await loadPromptCtx(deps.db, { scopeId: run.scope_id, runId: run.id });
  const r = await invokeAndValidate(deps, def, ctx, run.id);
  if (!r.ok) return { ok: false, error: r.error };
  const inserted: string[] = [];
  for (const s of r.out.sparks) {
    const ins = await deps.db.query(
      `INSERT INTO ceo_war_room_sparks
         (scope_id, tag, headline, evidence_short, why_evidence, risk_text, seed_group, generated_run_id)
       VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7, $8)
       RETURNING id::text`,
      [run.scope_id, s.tag, s.headline, s.evidence_short, JSON.stringify(s.why_evidence), s.risk_text, s.seed_group, run.id],
    );
    inserted.push(String(ins.rows[0]?.id));
  }
  return { ok: true, result: { mode: 'llm', count: inserted.length } };
}

function isUuid(s: string | null | undefined): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** 入口表 — 给 runHandlers.ts 的 HANDLERS 合并用 */
export const PROMPT_HANDLERS: Record<string, (deps: CeoEngineDeps, run: PromptRunRow) => Promise<HandlerResult>> = {
  'compass-stars':        handleCompassStars,
  'compass-drift-alert':  handleCompassDriftAlert,
  'compass-echo':         handleCompassEcho,
  'boardroom-rebuttal':   handleBoardroomRebuttal,
  'boardroom-annotation': handleBoardroomAnnotation,
  'boardroom-concerns':   handleBoardroomConcerns,
  'situation-signal':     handleSituationSignal,
  'situation-rubric':     handleSituationRubric,
  'balcony-prompt':       handleBalconyPrompt,
  'war-room-spark':       handleWarRoomSpark,
};

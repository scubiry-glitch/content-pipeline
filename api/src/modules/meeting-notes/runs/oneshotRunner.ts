// runs/oneshotRunner.ts — 与 claudeCliRunner 同拓扑（一次出 16 轴 JSON）
// 通道换成 Node 进程内 SDK 直连（services/llm.ts 多 provider 路由），不依赖 claude 二进制。
//
// 由 runEngine.execute() 在 mode='api-oneshot' 时调用。流程：
//   1. 拉转写正文（assets.content）；scope 模式由上层喂 prebuiltPrompt
//   2. 复用 promptTemplates/claudeCliFullPipeline.buildFullPrompt 拼整段 prompt
//   3. 调 deps.llm.completeWithSystem(prompt, '', { responseFormat: 'json', ... })
//   4. 解析 inner JSON（去 markdown 围栏 + 找 { } 边界）
//   5. 校验 schema（meeting / scope 分支）
//   6. 失败重试 1 次（温度 0.2 → 0.4）；仍失败 → recordOneshotRaw + throw
//   7. 返回 OneshotRunnerResult（与 ClaudeCliRunnerResult 同形，sessionId 永远 null）

import type { MeetingNotesDeps } from '../types.js';
import type { ExpertSnapshot, ExpertRoleAssignment } from './expertProfileLoader.js';
import { buildFullPrompt } from './promptTemplates/claudeCliFullPipeline.js';
import { emitProgress } from './runStreamRegistry.js';

// ============================================================
// 入参 / 出参（与 ClaudeCliRunnerCtx/Hooks/Result 同形，去掉 CLI 专属字段）
// ============================================================

export interface OneshotRunnerCtx {
  expertRoles: ExpertRoleAssignment | null;
  expertSnapshots: Map<string, ExpertSnapshot>;
  preset: 'lite' | 'standard' | 'max';
  decoratorChain: string[];
  scopeConfig: null | { preset: string; strategies?: string[]; decorators?: string[] };
  meetingKind: string | null;
  meetingTitle: string;
  participantsFromParse: Array<{ id: string; name: string }>;
  /** 'meeting'：runner 自己拼 prompt；'scope'：用 ctx.prebuiltPrompt */
  promptKind?: 'meeting' | 'scope';
  prebuiltPrompt?: string;
}

export interface OneshotRunnerHooks {
  writeStep: (
    key: 'spawn' | 'streaming' | 'parsing' | 'persisting',
    ratio: number,
    msg?: string,
  ) => Promise<void>;
  /** oneshot 走 deps.llm，token 由 llmUsageStorage 自动记账；保留接口签名让上层可选追加 */
  bumpUsage?: (input: number, output: number) => void;
  /** 异常情况下把 raw 原文记到 mn_runs.metadata.oneshotRaw（截断） */
  recordOneshotRaw: (raw: string) => Promise<void>;
}

export interface OneshotRunnerResult {
  meeting: Record<string, any>;
  participants: Array<{
    id: string;
    name: string;
    role?: string;
    initials?: string;
    tone?: 'neutral' | 'warm' | 'cool';
    speakingPct?: number;
  }>;
  analysis: Record<string, any>;
  axes: Record<string, any>;
  cliPersonMap: Record<string, string>;
  /** oneshot 无 session 概念，恒 null（保持与 ClaudeCliRunnerResult 字段对齐） */
  sessionId: null;
  /** services/llm.ts 当前不暴露 usage；预留字段，后续如需可从 router 透传 */
  inputTokens: number;
  cacheReadTokens: number;
  facts: Array<{
    subject?: string;
    predicate?: string;
    object?: string;
    confidence?: number;
    taxonomy_code?: string;
    context?: { quote?: string; [k: string]: unknown };
    [k: string]: unknown;
  }>;
  wikiMarkdown: {
    sourceEntry?: string;
    entityUpdates?: Array<{
      type?: 'entity' | 'concept';
      subtype?: 'person' | 'org' | 'product' | 'project' | 'event'
              | 'mental-model' | 'judgment' | 'bias' | 'counterfactual';
      canonicalName?: string;
      aliases?: string[];
      initialContent?: string;
      blockContent?: string;
      entityName?: string;
      appendMarkdown?: string;
    }>;
  };
  scopeUpdates?: Record<string, any>;
}

// ============================================================
// 配置
// ============================================================

const DEFAULT_TEMPERATURE = 0.2;
const RETRY_TEMPERATURE = 0.4;
/**
 * Oneshot 模型优先级：
 * 1) MN_ONESHOT_MODEL（meeting-notes 专用显式覆盖）
 * 2) SILICONFLOW_MODEL（兼容历史全局配置）
 * 3) undefined（交给 LLMRouter taskType=expert_library 的默认路由/模型）
 */
function getOneshotModel(): string | undefined {
  return process.env.MN_ONESHOT_MODEL?.trim()
    || process.env.SILICONFLOW_MODEL?.trim()
    || undefined;
}

function getOneshotMaxTokens(): number {
  const v = Number(process.env.MN_ONESHOT_MAX_TOKENS ?? 16384);
  return Number.isFinite(v) && v > 0 ? v : 16384;
}

function getOneshotTranscriptMaxChars(): number {
  const v = Number(process.env.MN_ONESHOT_TRANSCRIPT_MAX_CHARS ?? 120_000);
  return Number.isFinite(v) && v >= 20_000 ? v : 120_000;
}

function getOneshotChunkChars(): number {
  const v = Number(process.env.MN_ONESHOT_TRANSCRIPT_CHUNK_CHARS ?? 12_000);
  return Number.isFinite(v) && v >= 2_000 ? v : 12_000;
}

// ── 流式落库（断点保护） ──────────────────────────────────────
// 默认开启：oneshot 由于一次输出 16 轴 65k+ token，被 PM2 / SIGKILL 中断时
// LLM provider 已生成的 token 在客户端如不持久化就彻底丢失。开启后每达到
// PERSIST_INTERVAL_TOKENS 阈值就把 cumulative content 写到 mn_runs.metadata.oneshotRaw，
// startup-reap 保留之，方便后续 resume / salvage。
function isOneshotPersistRawEnabled(): boolean {
  return (process.env.MN_ONESHOT_PERSIST_RAW ?? 'true').toLowerCase() !== 'false';
}
function getOneshotPersistIntervalTokens(): number {
  const v = Number(process.env.MN_ONESHOT_PERSIST_RAW_INTERVAL_TOKENS ?? 1000);
  return Number.isFinite(v) && v >= 100 ? v : 1000;
}
function getOneshotPersistMaxBytes(): number {
  const v = Number(process.env.MN_ONESHOT_PERSIST_RAW_MAX_BYTES ?? 200_000);
  return Number.isFinite(v) && v > 0 ? v : 200_000;
}

// ============================================================
// 工具
// ============================================================

async function loadTranscript(deps: MeetingNotesDeps, assetId: string): Promise<string> {
  const r = await deps.db.query(
    `SELECT content FROM assets WHERE id = $1 LIMIT 1`,
    [assetId],
  );
  const content = (r.rows[0] as { content?: string | null } | undefined)?.content ?? '';
  return typeof content === 'string' ? content : '';
}

/**
 * Step 4 · 续跑提示读取
 * 若该 run 之前被 startup-reap 标过 metadata.resumable=true 且 oneshotRaw 已落库，
 * 取出来供后续拼到 prompt 末尾让 LLM 接着写。
 * 不会清空 oneshotRaw —— 万一这次也失败，下次仍可继续 resume。
 */
async function loadResumeHint(
  deps: MeetingNotesDeps,
  runId: string,
): Promise<{ raw: string; tokens: number } | null> {
  try {
    const r = await deps.db.query(
      `SELECT
         (metadata->>'oneshotRaw')        AS raw,
         COALESCE((metadata->>'oneshotRawTokens')::int, 0) AS tokens,
         COALESCE((metadata->>'resumable')::boolean, false) AS resumable
       FROM mn_runs WHERE id = $1`,
      [runId],
    );
    const row = r.rows[0] as { raw?: string | null; tokens?: number; resumable?: boolean } | undefined;
    if (!row || !row.resumable) return null;
    const raw = (row.raw ?? '').toString();
    if (raw.length < 200) return null; // 太短没意义
    return { raw, tokens: Number(row.tokens) || 0 };
  } catch (e) {
    console.warn(`[oneshotRunner ${runId.slice(0, 8)}] loadResumeHint failed: ${(e as Error).message}`);
    return null;
  }
}

function buildLocalIdMapping(
  parseParticipants: Array<{ id: string; name: string }>,
): { promptList: Array<{ localId: string; name: string }>; cliPersonMap: Record<string, string> } {
  const promptList: Array<{ localId: string; name: string }> = [];
  const cliPersonMap: Record<string, string> = {};
  parseParticipants.forEach((p, i) => {
    const localId = `p${i + 1}`;
    promptList.push({ localId, name: p.name });
    cliPersonMap[localId] = p.id;
  });
  return { promptList, cliPersonMap };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `\n…[truncated, total ${s.length}]`;
}

function splitByChars(text: string, chunkChars: number): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let cur = '';
  for (const line of lines) {
    const next = cur ? `${cur}\n${line}` : line;
    if (next.length <= chunkChars) {
      cur = next;
      continue;
    }
    if (cur) chunks.push(cur);
    if (line.length <= chunkChars) {
      cur = line;
    } else {
      // 单行超长时硬切，避免无限增长
      for (let i = 0; i < line.length; i += chunkChars) {
        chunks.push(line.slice(i, i + chunkChars));
      }
      cur = '';
    }
  }
  if (cur) chunks.push(cur);
  return chunks.filter((c) => c.trim().length > 0);
}

function condenseTranscriptForOneshot(transcript: string): { text: string; compressed: boolean; originalChars: number; finalChars: number } {
  const originalChars = transcript.length;
  const maxChars = getOneshotTranscriptMaxChars();
  if (originalChars <= maxChars) {
    return { text: transcript, compressed: false, originalChars, finalChars: originalChars };
  }

  const chunkChars = getOneshotChunkChars();
  const chunks = splitByChars(transcript, chunkChars);
  const headChars = 900;
  const tailChars = 380;

  const sections = chunks.map((chunk, idx) => {
    const clean = chunk.trim();
    const head = clean.slice(0, Math.min(headChars, clean.length));
    const tail = clean.length > headChars
      ? clean.slice(Math.max(head.length, clean.length - tailChars))
      : '';
    return [
      `## Chunk ${idx + 1}/${chunks.length} · ${clean.length} chars`,
      head,
      tail ? `... [middle omitted] ...\n${tail}` : '',
    ].filter(Boolean).join('\n');
  });

  const condensed = [
    `[Transcript compressed for oneshot stability]`,
    `Original chars: ${originalChars}`,
    `Chunks: ${chunks.length} (chunkChars=${chunkChars})`,
    `Each chunk keeps head+tail excerpts; middle omitted.`,
    '',
    sections.join('\n\n'),
  ].join('\n');

  // 最终二次兜底，保证压缩后不会无限膨胀
  const hardCap = Math.max(maxChars, 40_000);
  const finalText = condensed.length > hardCap ? `${condensed.slice(0, hardCap)}\n\n...[condensed transcript hard-truncated]` : condensed;
  return { text: finalText, compressed: true, originalChars, finalChars: finalText.length };
}

/** 解析 LLM 返回文本里的 JSON：先尝试直接 parse；失败则去 markdown 围栏；再失败找 { } 边界 */
function parseInnerJson(raw: string): { ok: true; value: any } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'empty raw' };
  let text = raw.trim();
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {/* 继续兜底 */}
  if (text.startsWith('```')) {
    const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) text = m[1].trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Step 5 · 截断 JSON 兜底解析
 *
 * 用于 oneshot 被 SIGKILL 后 metadata.oneshotRaw 是不完整 JSON 的场景。
 * 策略：从首个 '{' 开始遍历，跟踪 stack 与 string 状态，记录"安全回滚点"
 *      （顶层属性值刚结束的位置）；正常解析失败后从最新回滚点向后逐个尝试。
 *
 * 返回 salvaged=true 表明结果是部分内容，调用方应当向用户/日志明确标注。
 *
 * 不接到 parseInnerJson 的正常路径：避免把 LLM 偶尔的小毛病结果静默"修好"，
 * 导致 schema 校验过了但内容残缺。仅供 /runs/:id/salvage-oneshot-raw 显式调用。
 */
export function salvageTruncatedJson(
  raw: string,
): { ok: true; value: any; salvaged: boolean; safePoints: number; usedAt: number }
 | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'empty raw' };
  let text = raw.trim();

  // 去 markdown 围栏
  if (text.startsWith('```')) {
    const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) text = m[1].trim();
  }

  // 找首个 '{'
  const start = text.indexOf('{');
  if (start < 0) return { ok: false, reason: 'no opening brace' };
  text = text.slice(start);

  // 先尝试整段 parse —— 万一本来就完整
  try {
    return { ok: true, value: JSON.parse(text), salvaged: false, safePoints: 0, usedAt: text.length };
  } catch {/* fall through */}

  // 遍历记录安全回滚点（顶层属性边界）
  const stack: string[] = ['{']; // 已经把首个 '{' 入栈
  let inStr = false, escape = false;
  const safePositions: number[] = []; // 长度 = 截断到此处后可以加 '}' 闭合的字节数

  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      // 整段在此自然闭合 —— parseInnerJson 已经试过了应该走不到，但保险
      if (stack.length === 0) {
        try { return { ok: true, value: JSON.parse(text.slice(0, i + 1)), salvaged: false, safePoints: safePositions.length, usedAt: i + 1 }; }
        catch (e) { return { ok: false, reason: `top-close parse: ${(e as Error).message}` }; }
      }
      // 刚收回到 depth=1，意味着上一个顶层 value 正好结束 → 此处 + '}' 可成完整对象
      if (stack.length === 1) safePositions.push(i + 1);
    } else if (ch === ',' && stack.length === 1) {
      // depth=1 的逗号，意味着上一个 key:value 完整结束 → 截到逗号前 + '}' 也可
      safePositions.push(i);
    }
  }

  // 从最新安全点逆向尝试，第一个能 parse 的就返回
  for (let p = safePositions.length - 1; p >= 0; p--) {
    const trimmed = text.slice(0, safePositions[p]).replace(/,\s*$/, '') + '}';
    try {
      const value = JSON.parse(trimmed);
      return { ok: true, value, salvaged: true, safePoints: safePositions.length, usedAt: safePositions[p] };
    } catch { /* try next */ }
  }

  return { ok: false, reason: `salvage failed (tried ${safePositions.length} safe points)` };
}

/** 校验 LLM 输出形态（与 claudeCliRunner.validateInner 等价但独立写一份） */
function validateOneshotSchema(
  parsed: any,
  kind: 'meeting' | 'scope',
): { ok: true } | { ok: false; reason: string } {
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'inner JSON is not an object' };
  if (kind === 'scope') {
    if (!parsed.scopeUpdates || typeof parsed.scopeUpdates !== 'object') {
      return { ok: false, reason: 'missing scopeUpdates object' };
    }
    return { ok: true };
  }
  if (!parsed.analysis || typeof parsed.analysis !== 'object') return { ok: false, reason: 'missing analysis object' };
  if (!parsed.axes || typeof parsed.axes !== 'object') return { ok: false, reason: 'missing axes object' };
  if (!Array.isArray(parsed.participants)) return { ok: false, reason: 'missing or non-array participants' };
  const a = parsed.analysis;
  if (!a.summary || typeof a.summary !== 'object') return { ok: false, reason: 'analysis.summary missing' };
  if (!Array.isArray(a.summary?.actionItems)) return { ok: false, reason: 'analysis.summary.actionItems must be array' };
  for (const k of ['tension', 'newCognition', 'focusMap', 'consensus', 'crossView']) {
    if (!Array.isArray(a[k])) return { ok: false, reason: `analysis.${k} must be array` };
  }
  return { ok: true };
}

// ============================================================
// 主入口
// ============================================================

export async function runOneshotMode(
  deps: MeetingNotesDeps,
  payload: { runId: string; meetingId: string; assetId: string },
  ctx: OneshotRunnerCtx,
  hooks: OneshotRunnerHooks,
): Promise<OneshotRunnerResult> {
  const promptKind = ctx.promptKind ?? 'meeting';

  // ── 1. 准备 prompt + localId 映射 ─────────────────────────────
  let prompt: string;
  let cliPersonMap: Record<string, string> = {};
  if (promptKind === 'scope') {
    if (!ctx.prebuiltPrompt) throw new Error('scope mode requires ctx.prebuiltPrompt');
    prompt = ctx.prebuiltPrompt;
  } else {
    const transcript = await loadTranscript(deps, payload.assetId);
    if (!transcript || transcript.trim().length < 50) {
      throw new Error('transcript too short or empty (assets.content)');
    }
    const condensed = condenseTranscriptForOneshot(transcript);
    if (condensed.compressed) {
      await hooks.writeStep('spawn', 0.06, `转写分段压缩 ${condensed.originalChars} → ${condensed.finalChars} chars`);
      console.log(`[oneshotRunner ${payload.runId.slice(0, 8)}] transcript condensed ${condensed.originalChars} -> ${condensed.finalChars}`);
    }
    const mapping = buildLocalIdMapping(ctx.participantsFromParse);
    cliPersonMap = mapping.cliPersonMap;
    prompt = buildFullPrompt({
      meetingId: payload.meetingId,
      meetingTitle: ctx.meetingTitle,
      meetingKind: ctx.meetingKind,
      participants: mapping.promptList,
      transcript: condensed.text,
      expertRoles: ctx.expertRoles,
      expertSnapshots: ctx.expertSnapshots,
      preset: ctx.preset,
      decoratorChain: ctx.decoratorChain,
      scopeConfig: ctx.scopeConfig,
    });
  }

  // Step 4 · 续跑提示：如本 run 是被 reap 后通过 /runs/:id/resume 重新入队的，
  // 把上一代已生成的 raw 拼到 prompt 末尾，告诉 LLM 续写不要重复
  const resumeHint = await loadResumeHint(deps, payload.runId);
  if (resumeHint) {
    prompt += `\n\n---\n\n# 续跑指引\n上一次本任务已经生成到如下内容（约 ${resumeHint.tokens} tokens）：\n\n\`\`\`\n${resumeHint.raw}\n\`\`\`\n\n请从中断处直接继续输出，**不要重复**已经生成的内容。最终结果必须是合法 JSON。`;
    await hooks.writeStep('spawn', 0.08, `续跑模式：注入历史 raw ${resumeHint.tokens} tokens`);
    console.log(`[oneshotRunner ${payload.runId.slice(0, 8)}] resume from prior raw (${resumeHint.tokens} tokens, ${resumeHint.raw.length} chars)`);
  }

  await hooks.writeStep('spawn', 0.1,
    promptKind === 'scope' ? '调用 LLM API · scope oneshot' : '调用 LLM API · oneshot');

  // ── 2. 调 LLM。失败时升温重试 1 次 ──
  const tryOnce = async (temperature: number): Promise<
    | { ok: true; raw: string; parsed: any }
    | { ok: false; reason: string; raw: string }
  > => {
    await hooks.writeStep('streaming', 0.5, `等待 LLM 响应（temp=${temperature}）`);
    let raw = '';
    try {
      const oneshotModel = getOneshotModel();
      const maxTok = getOneshotMaxTokens();
      // ── 流式落库节流状态（断点保护，被 SIGKILL 后 raw 仍在 DB） ──
      const persistEnabled = isOneshotPersistRawEnabled();
      const persistEveryTokens = getOneshotPersistIntervalTokens();
      const persistMaxBytes = getOneshotPersistMaxBytes();
      let lastPersistedAt = 0;
      let persistInFlight = false;       // 防止落库 SQL 重叠
      let persistTruncated = false;       // 一旦触顶不再尝试落库

      const persistRaw = async (cumulative: string, tokensSoFar: number): Promise<void> => {
        if (!persistEnabled || persistInFlight || persistTruncated) return;
        // 触顶判定：超出 max bytes 后只截断写一次，之后的 chunk 全部跳过，
        // 避免每个 chunk 都做巨大 jsonb update
        let payloadStr = cumulative;
        if (Buffer.byteLength(payloadStr, 'utf8') > persistMaxBytes) {
          payloadStr = payloadStr.slice(0, persistMaxBytes) + '\n…[truncated to MN_ONESHOT_PERSIST_RAW_MAX_BYTES]';
          persistTruncated = true;
        }
        persistInFlight = true;
        try {
          await deps.db.query(
            `UPDATE mn_runs
                SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                      'oneshotRaw',       $1::text,
                      'oneshotRawTokens', $2::int,
                      'oneshotRawBytes',  $3::int,
                      'oneshotRawAt',     NOW()::text,
                      'oneshotRawTruncated', $4::boolean
                    )
              WHERE id = $5`,
            [payloadStr, tokensSoFar, Buffer.byteLength(payloadStr, 'utf8'), persistTruncated, payload.runId],
          );
        } catch (e) {
          // 落库失败不致命：记日志，让主流程照常生成
          console.warn(`[oneshotRunner ${payload.runId.slice(0, 8)}] persistRaw failed: ${(e as Error).message}`);
        } finally {
          persistInFlight = false;
        }
      };

      // 把已生成 token 数折算成 0.5→0.82 区间的进度，每 200 token 写一次 DB
      const onProgress = async (tokensSoFar: number, snippet: string, cumulative?: string) => {
        const ratio = 0.5 + Math.min(0.32, 0.32 * (tokensSoFar / maxTok));
        const message = `生成中… ${tokensSoFar} / ${maxTok} tokens`;
        emitProgress(payload.runId, { tokensSoFar, ratio, message, snippet });
        await hooks.writeStep('streaming', ratio, message);
        // 流式落库（仅 streaming provider 会传 cumulative）
        if (cumulative && tokensSoFar - lastPersistedAt >= persistEveryTokens) {
          lastPersistedAt = tokensSoFar;
          await persistRaw(cumulative, tokensSoFar);
        }
      };
      raw = await deps.llm.completeWithSystem(prompt, '', {
        responseFormat: 'json',
        temperature,
        maxTokens: maxTok,
        onProgress,
        ...(oneshotModel ? { model: oneshotModel } : {}),
      });
      // 收尾：确保最终全量也落一次（弥补 stream 末尾不到 interval 阈值的尾巴）
      if (persistEnabled && raw && raw.length > 0) {
        await persistRaw(raw, Math.round(raw.length / 2));
      }
    } catch (e) {
      throw new Error(`oneshot LLM call failed: ${(e as Error).message}`);
    }
    if (!raw || raw.trim().length === 0) {
      return { ok: false, reason: 'LLM returned empty', raw };
    }
    await hooks.writeStep('parsing', 0.85, '解析 JSON');
    const parsed = parseInnerJson(raw);
    if (!parsed.ok) return { ok: false, reason: `JSON.parse: ${parsed.reason}`, raw };
    const v = validateOneshotSchema(parsed.value, promptKind);
    if (!v.ok) return { ok: false, reason: `schema: ${v.reason}`, raw };
    return { ok: true, raw, parsed: parsed.value };
  };

  let r = await tryOnce(DEFAULT_TEMPERATURE);
  if (!r.ok) {
    console.warn(`[oneshotRunner ${payload.runId.slice(0, 8)}] first attempt failed (${r.reason}); retrying with temp=${RETRY_TEMPERATURE}`);
    r = await tryOnce(RETRY_TEMPERATURE);
  }
  if (!r.ok) {
    await hooks.recordOneshotRaw(truncate(r.raw, 200_000));
    throw new Error(`oneshot output malformed (after retry): ${r.reason}`);
  }

  const inner = r.parsed;

  // ── 3. 组装结果（与 ClaudeCliRunnerResult 同形） ─────────────
  if (promptKind === 'scope') {
    return {
      meeting: {},
      participants: [],
      analysis: {},
      axes: {},
      cliPersonMap: {},
      sessionId: null,
      inputTokens: 0,
      cacheReadTokens: 0,
      facts: [],
      wikiMarkdown: {},
      scopeUpdates: inner.scopeUpdates ?? {},
    };
  }

  return {
    meeting: inner.meeting ?? { id: payload.meetingId, title: ctx.meetingTitle },
    participants: inner.participants,
    analysis: inner.analysis,
    axes: inner.axes,
    cliPersonMap,
    sessionId: null,
    inputTokens: 0,
    cacheReadTokens: 0,
    facts: Array.isArray(inner.facts) ? inner.facts : [],
    wikiMarkdown: inner.wikiMarkdown && typeof inner.wikiMarkdown === 'object' ? inner.wikiMarkdown : {},
  };
}

// 测试钩子（不在主流程中导出）
export const __test__ = { parseInnerJson, validateOneshotSchema, buildLocalIdMapping };

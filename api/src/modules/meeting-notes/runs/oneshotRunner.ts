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
    const mapping = buildLocalIdMapping(ctx.participantsFromParse);
    cliPersonMap = mapping.cliPersonMap;
    prompt = buildFullPrompt({
      meetingId: payload.meetingId,
      meetingTitle: ctx.meetingTitle,
      meetingKind: ctx.meetingKind,
      participants: mapping.promptList,
      transcript,
      expertRoles: ctx.expertRoles,
      expertSnapshots: ctx.expertSnapshots,
      preset: ctx.preset,
      decoratorChain: ctx.decoratorChain,
      scopeConfig: ctx.scopeConfig,
    });
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
      raw = await deps.llm.completeWithSystem(prompt, '', {
        responseFormat: 'json',
        temperature,
        maxTokens: getOneshotMaxTokens(),
        ...(oneshotModel ? { model: oneshotModel } : {}),
      });
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

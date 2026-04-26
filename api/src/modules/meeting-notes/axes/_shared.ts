// axes/_shared.ts — 16 个 computer 共用的类型 + 工具
//
// 所有 computer 同形：接受 (deps, args) 返回 ComputeResult
// args.replaceExisting=true 会先清洗旧数据后再写入（幂等重算）
// args.replaceExisting=false（默认）= 增量追加

import type { MeetingNotesDeps } from '../types.js';
import { applyDecoratorStack, getCurrentStrategy } from './decoratorStack.js';
import { chunkedContent } from '../parse/claimExtractor.js';

export interface ComputeArgs {
  meetingId?: string;
  scopeId?: string | null;
  scopeKind?: 'library' | 'project' | 'client' | 'topic' | 'meeting';
  /** 强制删掉旧数据再写（PR4 run engine 会设为 true 以保证 run 幂等） */
  replaceExisting?: boolean;
}

export interface ComputeResult {
  subDim: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  sampleIds?: string[];
  /** Opt-1 (O1): chunked LLM 调用中 JSON 解析失败次数 */
  parseFailures?: number;
  /** Opt-1 (O2): 失败样例（前 5 条）；含 message + 上下文，方便定位 silent-zero */
  errorSamples?: Array<{
    kind: 'parse' | 'db' | 'transform';
    message: string;
    excerpt?: string;   // 出错时的关键字段，如 LLM 返回前 80 字 / item.text 前 60 字
  }>;
}

/** Opt-1: computer 内 push 错误样例的工具，统一控制上限避免 metadata 膨胀 */
export function pushErrorSample(
  out: ComputeResult,
  kind: 'parse' | 'db' | 'transform',
  message: string,
  excerpt?: string,
): void {
  if (!out.errorSamples) out.errorSamples = [];
  if (out.errorSamples.length >= 5) return;
  out.errorSamples.push({ kind, message: message.slice(0, 200), excerpt: excerpt?.slice(0, 200) });
}

/**
 * 宽松解析 LLM 返回的 JSON。允许：
 *   - 直接 JSON
 *   - ```json ... ``` 代码块
 *   - 夹杂自然语言的 JSON 片段（取第一个 [ 或 { 到匹配的 ] / }）
 */
export function safeJsonParse<T = any>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  const s = raw.trim();
  try { return JSON.parse(s) as T; } catch { /* fallthrough */ }

  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()) as T; } catch { /* fallthrough */ }
  }

  // 取第一个 [ 或 { 到对应 ] / } 的闭合
  const firstBrace = s.search(/[\[{]/);
  if (firstBrace >= 0) {
    const open = s[firstBrace] as '[' | '{';
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    for (let i = firstBrace; i < s.length; i++) {
      if (s[i] === open) depth++;
      else if (s[i] === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(s.slice(firstBrace, i + 1)) as T; } catch { /* fail */ }
          break;
        }
      }
    }
  }
  return fallback;
}

/**
 * 调用 expertApplication 决定用哪个 strategy + preset，然后走 LLM 补全。
 * 若 expertApplication.resolveForMeetingKind 返回 null（如 internal_ops）则
 * 跳过直接返回空字符串；否则把当前 run 的装饰器栈（evidence_anchored /
 * calibrated_confidence / knowledge_grounded …）追加到 systemPrompt，再走
 * llm.completeWithSystem。装饰器栈通过 strategyStorage AsyncLocalStorage
 * 由 runEngine 在 execute() 顶层注入；axis computer 无需感知。
 */
/**
 * P0-3 全局保留原文细节指令：在所有 axis computer 的 system prompt 顶部强制注入。
 * 之前各 computer 各自零散提"必须保留原文数字"，标准不一；用全局前缀统一收口。
 * DeepSeek V3.2 在 responseFormat:'json' 下默认偏向"概括式中文输出"，这条
 * 规则把它扳回"原文优先 + 数字保留 + 不套话"。
 */
const GLOBAL_DIRECTIVE = `── 全局规则（凌驾于其它指令）──
1. 必须保留原文中的所有数字、比率、日期、公司/人名、专有名词。
   "3 家"不要写成"几家"；"6000 万美元"不要写成"约 6000 万"；
   "Q3 配额"不要写成"未来某季度配额"。
2. 任何字段值都不要使用以下套话：
   "经过讨论"、"达成共识"、"会议成员"、"具体来说"、"总的来说"、
   "全面提升"、"深度赋能"、"形成抓手"、"打通链路"。
   被这些词替代的具体内容必须直接写出来。
3. 所有引用 / quote 字段必须能在原文中精确检索到（短至 20 字，长至 60 字）。
4. confidence / score 等数值字段不要默认 0.5 / 0.7；必须给与文本证据强度匹配的值。

`;

export async function callExpertOrLLM(
  deps: MeetingNotesDeps,
  meetingKind: string | null | undefined,
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  if (deps.expertApplication.shouldSkipExpertAnalysis(meetingKind)) {
    return '';
  }
  // 注入装饰器栈（静态 import，避免每次调用走 dynamic import 解析开销）
  const strategy = getCurrentStrategy();
  const { prompt: decorated } = applyDecoratorStack(systemPrompt, strategy?.strategySpec ?? null);

  // 全局前缀：保留原文细节、避免套话
  const fullSystem = GLOBAL_DIRECTIVE + decorated;

  return deps.llm.completeWithSystem(fullSystem, userPrompt, {
    temperature: options?.temperature ?? 0.2,
    maxTokens: options?.maxTokens ?? 2000,
    responseFormat: 'json',
  });
}

/** 统一 computer 空结果 */
export function emptyResult(subDim: string): ComputeResult {
  return { subDim, created: 0, updated: 0, skipped: 0, errors: 0 };
}

/**
 * P0-1 滑窗 LLM 抽取：把 content 切成多个 chunks，每个 chunk 调一次 LLM，
 * 结果合并并按 dedupeKey 去重。用于 LIST-OUTPUT axis（commitments、
 * assumptions 等）替代 budgetedExcerpt 的"开头+结尾"腰斩做法。
 *
 * 注意：每个 chunk 一次 LLM 调用 → cost 会乘 N 倍（N = chunks 数）；为了
 * 兼顾 cost，content ≤ chunkSize 时退化为单次调用，与原行为一致。
 *
 * @param buildUserPrompt — 收 (chunk, idx, total) 返回 user prompt 的函数
 * @param dedupeKey       — 给每条 item 算一个 string key，相同 key 视为重复
 *                          （第一次出现的保留，后续覆盖被丢弃）。
 */
export interface ExtractStats {
  parseFailures: number;
  llmCallFailures: number;
  /** 每个 chunk 拿到 0 个 item 的次数（可能 LLM 真的没找到，也可能是坏 JSON 兜底） */
  emptyChunks: number;
  /** 失败样例（前 3 条） */
  samples: Array<{ kind: 'parse' | 'llm'; message: string; excerpt?: string }>;
}

export async function extractListOverChunks<T = any>(
  deps: MeetingNotesDeps,
  meetingKind: string | null | undefined,
  systemPrompt: string,
  buildUserPrompt: (chunk: string, idx: number, total: number) => string,
  content: string,
  options: {
    dedupeKey?: (item: T) => string;
    chunkSize?: number;
    overlap?: number;
    temperature?: number;
    maxTokens?: number;
    /** Opt-1：把 chunk 级失败计数 push 到调用方的 ComputeResult 上 */
    statsSink?: ComputeResult;
  } = {},
): Promise<T[]> {
  const chunks = chunkedContent(content, options.chunkSize ?? 4500, options.overlap ?? 400);
  const all: T[] = [];
  const seen = new Set<string>();
  const sink = options.statsSink;

  for (let i = 0; i < chunks.length; i++) {
    const userPrompt = buildUserPrompt(chunks[i], i, chunks.length);
    let raw = '';
    try {
      raw = await callExpertOrLLM(
        deps,
        meetingKind,
        systemPrompt,
        userPrompt,
        { temperature: options.temperature, maxTokens: options.maxTokens },
      );
    } catch (e) {
      if (sink) {
        sink.errors = (sink.errors ?? 0) + 1;
        pushErrorSample(sink, 'transform', `chunk[${i+1}/${chunks.length}] LLM call: ${(e as Error).message}`);
      }
      continue;
    }
    // 用一个"看似已尝试解析"哨兵区分"LLM 真返空数组"vs"JSON 解析失败兜底返空"
    const PARSE_FAIL = Symbol('parse-fail');
    let parsed: T[] | typeof PARSE_FAIL = PARSE_FAIL;
    try {
      const trimmed = (raw ?? '').trim();
      if (trimmed.length === 0) {
        parsed = [];
      } else {
        const j = safeJsonParse<T[] | null>(trimmed, null);
        parsed = Array.isArray(j) ? j : PARSE_FAIL;
      }
    } catch {
      parsed = PARSE_FAIL;
    }
    if (parsed === PARSE_FAIL) {
      if (sink) {
        sink.parseFailures = (sink.parseFailures ?? 0) + 1;
        pushErrorSample(sink, 'parse', `chunk[${i+1}/${chunks.length}] returned non-array JSON`,
                        raw.slice(0, 120));
      }
      continue;
    }
    const items = parsed as T[];

    for (const item of items) {
      const key = options.dedupeKey ? options.dedupeKey(item) : JSON.stringify(item);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(item);
    }
  }
  return all;
}

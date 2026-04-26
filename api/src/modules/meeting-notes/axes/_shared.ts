// axes/_shared.ts — 16 个 computer 共用的类型 + 工具
//
// 所有 computer 同形：接受 (deps, args) 返回 ComputeResult
// args.replaceExisting=true 会先清洗旧数据后再写入（幂等重算）
// args.replaceExisting=false（默认）= 增量追加

import type { MeetingNotesDeps } from '../types.js';
import { applyDecoratorStack, getCurrentStrategy } from './decoratorStack.js';

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

  return deps.llm.completeWithSystem(decorated, userPrompt, {
    temperature: options?.temperature ?? 0.2,
    maxTokens: options?.maxTokens ?? 2000,
    responseFormat: 'json',
  });
}

/** 统一 computer 空结果 */
export function emptyResult(subDim: string): ComputeResult {
  return { subDim, created: 0, updated: 0, skipped: 0, errors: 0 };
}

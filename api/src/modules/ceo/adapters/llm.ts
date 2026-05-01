// CEO 模块 LLM Adapter 接口
//
// 设计目的：g3/g4 加工任务需要 LLM 调用，但 mn 的 claudeCliRunner 内部紧耦合
// 会议纪要的 axis prompt 模板。CEO 不直接 import 它，而是定义一个最小适配器接口，
// 由 server.ts 注入实现 (生产用真 claude-cli/Anthropic SDK，单测用 stub)。
//
// 当前阶段：runHandlers 里 deps.llm 为空时仍走 stub (写"占位结果")。
// 后续 commit 将真实接入：在 server.ts 用 mn 的 claudeCliRunner 包装一个 CeoLLMAdapter
// 实例传给 createCeoEngine。

export interface CeoLLMInvokeInput {
  /** 用户 prompt */
  prompt: string;
  /** 可选 system prompt */
  system?: string;
  /** 期望 JSON 输出时填，模型会被引导返回结构化文本 */
  responseFormat?: 'text' | 'json';
  /** 最大输出 tokens */
  maxTokens?: number;
  /** 0..1 */
  temperature?: number;
  /** 任务标签 — 便于日志/账单分析 (g3-rebuttal / g4-cross-meeting / etc) */
  taskTag?: string;
}

export interface CeoLLMInvokeResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model?: string;
}

export interface CeoLLMAdapter {
  /** 跑一次 prompt，返回纯文本 + 成本统计 */
  invoke(input: CeoLLMInvokeInput): Promise<CeoLLMInvokeResult>;

  /** 是否可用 — 没有 API Key / claude-cli 失败时返回 false，handler 走 stub 兜底 */
  isAvailable(): boolean;
}

/** Null stub — 默认实现，所有调用都标 unavailable，逼 handler 走 stub 兜底分支 */
export class NullCeoLLMAdapter implements CeoLLMAdapter {
  async invoke(_input: CeoLLMInvokeInput): Promise<CeoLLMInvokeResult> {
    throw new Error('[CeoLLMAdapter] not configured. Inject real adapter via createCeoEngine deps.');
  }

  isAvailable(): boolean {
    return false;
  }
}

/**
 * 把 mn 的 claudeCliRunner 适配为 CeoLLMAdapter
 * 用法 (server.ts):
 *
 *   import { createClaudeCliCeoLLMAdapter } from './modules/ceo/adapters/llm.js';
 *   import { runClaudeCli } from './modules/meeting-notes/runs/claudeCliRunner.js';
 *
 *   const llm = createClaudeCliCeoLLMAdapter({ runClaudeCli });
 *   const ceoEngine = createCeoEngine(createCeoPipelineDeps({ ..., llm }));
 *
 * 实现 stub —— 真接入需要：
 *   1) 调 runClaudeCli({ prompt, system, max_tokens, temperature, taskTag })
 *   2) 解析 stdout 为 text，从 metadata 取 tokensIn/tokensOut/durationMs
 *   3) 在 Engine 的 g3/g4 任务里通过 deps.llm.invoke({...}) 拿到 text 后写库
 */
export function createClaudeCliCeoLLMAdapter(_deps: {
  runClaudeCli?: (...args: any[]) => any;
}): CeoLLMAdapter {
  // TODO: 真实接入 claudeCliRunner — 当前返回 stub 供编译通过
  return new NullCeoLLMAdapter();
}

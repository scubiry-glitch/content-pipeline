// Pipeline Adapter — 桥接 pipeline 已有服务到 Meeting Notes 模块（嵌入模式）
// 参照 modules/expert-library/adapters/pipeline.ts 风格

import { AsyncLocalStorage } from 'node:async_hooks';
import { getLLMRouter } from '../../../providers/index.js';
import type { GenerationParams } from '../../../types/index.js';
import { LocalEventBus } from './local-event-bus.js';
import { PostgresTextSearch } from './postgres-text-search.js';
import type {
  DatabaseAdapter,
  EmbeddingAdapter,
  EventBusAdapter,
  ExpertApplicationAdapter,
  ExpertsAdapter,
  AssetsAiAdapter,
  LLMAdapter,
  LLMOptions,
  MeetingNotesDeps,
  ParsedMeeting,
  TextSearchAdapter,
} from '../types.js';

// ---------- DB ----------
export function createPipelineDBAdapter(
  queryFn: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
): DatabaseAdapter {
  return { query: queryFn };
}

// ---------- LLM ----------
function toRouterParams(options?: LLMOptions, systemPrompt?: string): GenerationParams {
  const p: GenerationParams = {
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    model: options?.model,
  };
  if (systemPrompt) p.systemPrompt = systemPrompt;
  if (options?.responseFormat) p.responseFormat = options.responseFormat;
  return p;
}

/**
 * 每次 LLM 调用的 token 用量；通过 AsyncLocalStorage 与当前 run 关联，
 * 这样 runEngine.execute() 包一层 llmUsageStorage.run(counter, ...) 就能
 * 累加该 run 内所有 LLM 调用的 input/output tokens（无需修改任何 axis computer）。
 */
export interface LLMUsageCounter {
  input: number;
  output: number;
  calls: number;
}
export const llmUsageStorage = new AsyncLocalStorage<LLMUsageCounter>();

function recordUsage(usage: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } | undefined) {
  const counter = llmUsageStorage.getStore();
  if (!counter) return;
  const inp = usage?.inputTokens ?? usage?.promptTokens ?? 0;
  const out = usage?.outputTokens ?? usage?.completionTokens ?? 0;
  counter.input += inp;
  counter.output += out;
  counter.calls += 1;
}

export function createPipelineLLMAdapter(): LLMAdapter {
  return {
    async complete(prompt: string, options?: LLMOptions): Promise<string> {
      const router = getLLMRouter();
      const result = await router.generate(prompt, 'expert_library', toRouterParams(options));
      recordUsage(result.usage);
      return result.content;
    },
    async completeWithSystem(systemPrompt: string, userPrompt: string, options?: LLMOptions): Promise<string> {
      const router = getLLMRouter();
      const result = await router.generate(userPrompt, 'expert_library', toRouterParams(options, systemPrompt));
      recordUsage(result.usage);
      return result.content;
    },
  };
}

// ---------- Embedding (PR1 占位，PR3 起按需替换) ----------
export function createNoopEmbeddingAdapter(): EmbeddingAdapter {
  return {
    async embed(_text: string): Promise<number[]> {
      return [];
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return texts.map(() => []);
    },
  };
}

// ---------- Experts（来自 modules/expert-library） ----------
export interface PipelineExpertsHandle {
  invoke(req: {
    expert_id: string;
    task_type: string;
    input_data: any;
    input_type?: string;
  }): Promise<any>;
}

export function createPipelineExpertsAdapter(handle: PipelineExpertsHandle): ExpertsAdapter {
  return {
    async invoke(req) {
      const res = await handle.invoke(req);
      // expert-library ExpertResponse 是 { output: { sections: [...] }, metadata: {...} }
      // meeting-notes 内部偏好 { output_sections: {...} } 扁平形式，此处兼容两者
      const sections =
        res?.output_sections ??
        (Array.isArray(res?.output?.sections)
          ? Object.fromEntries(
              res.output.sections.map((s: any, i: number) => [s?.id ?? s?.name ?? `s${i}`, s]),
            )
          : {});
      return {
        output_sections: sections,
        emm_gates_passed: res?.emm_gates_passed ?? res?.metadata?.emm_result?.gates_passed,
        confidence: res?.confidence ?? res?.metadata?.confidence,
        raw: typeof res?.raw === 'string' ? res.raw : undefined,
      };
    },
  };
}

// ---------- Expert Application（来自 services/expert-application） ----------
export interface PipelineExpertAppHandle {
  resolveForMeetingKind(kind: string | null | undefined): {
    preset: 'lite' | 'standard' | 'max';
    default: string;
  } | null;
  shouldSkipExpertAnalysis(kind: string | null | undefined): boolean;
}

export function createPipelineExpertApplicationAdapter(
  handle: PipelineExpertAppHandle,
): ExpertApplicationAdapter {
  return {
    resolveForMeetingKind(kind) {
      const spec = handle.resolveForMeetingKind(kind);
      return spec ? { preset: spec.preset, default: spec.default } : null;
    },
    shouldSkipExpertAnalysis(kind) {
      return handle.shouldSkipExpertAnalysis(kind);
    },
  };
}

// ---------- assets-ai（PR1 最小封薄；PR2 起用真 orchestrator） ----------
export function createNoopAssetsAiAdapter(): AssetsAiAdapter {
  return {
    async parseMeeting(assetId: string): Promise<ParsedMeeting> {
      return { assetId };
    },
  };
}

// ---------- 聚合工厂 ----------
export interface PipelineDepsInput {
  db: DatabaseAdapter;
  llm?: LLMAdapter;
  embedding?: EmbeddingAdapter;
  experts: ExpertsAdapter;
  expertApplication: ExpertApplicationAdapter;
  assetsAi?: AssetsAiAdapter;
  eventBus?: EventBusAdapter;
  textSearch?: TextSearchAdapter;
}

export function createPipelineDeps(input: PipelineDepsInput): MeetingNotesDeps {
  return {
    db: input.db,
    llm: input.llm ?? createPipelineLLMAdapter(),
    embedding: input.embedding ?? createNoopEmbeddingAdapter(),
    experts: input.experts,
    expertApplication: input.expertApplication,
    assetsAi: input.assetsAi ?? createNoopAssetsAiAdapter(),
    eventBus: input.eventBus ?? new LocalEventBus(),
    textSearch: input.textSearch ?? new PostgresTextSearch(input.db),
  };
}

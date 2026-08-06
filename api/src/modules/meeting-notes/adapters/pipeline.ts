// Pipeline Adapter — 桥接 pipeline 已有服务到 Meeting Notes 模块（嵌入模式）
// 参照 modules/expert-library/adapters/pipeline.ts 风格

import { AsyncLocalStorage } from 'node:async_hooks';
import { getLLMRouter } from '../../../providers/index.js';
import { getEmbeddingService, type EmbeddingService } from '../../../services/assets-ai/embedding.js';
import type { GenerationParams } from '../../../types/index.js';
import { LocalEventBus } from './local-event-bus.js';
import { PostgresTextSearch } from './postgres-text-search.js';
import { parseTranscript } from '../parse/transcriptParser.js';
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
    onProgress: options?.onProgress,
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

function coerceVec1024(v: number[]): number[] {
  if (v.length === 1024) return v;
  if (v.length > 1024) return v.slice(0, 1024);
  const out = v.slice();
  while (out.length < 1024) out.push(0);
  return out;
}

/**
 * 语义门控的真嵌入适配器。
 * provider!=='local' → coerceVec768(service.embed(text))；
 * provider==='local'（哈希兜底,无语义）→ 返回 []，经 EntityResolver C1 guard 落 null，
 * 保持 P2 的 exact+alias 行为，杜绝垃圾向量导致的误合并。
 * 真嵌入调用抛错 → 降级 [] + warn，绝不 sink 上游解析。
 */
export function createSemanticEmbeddingAdapter(
  service: EmbeddingService = getEmbeddingService(),
): EmbeddingAdapter {
  const semantic = () => service.provider !== 'local';
  return {
    async embed(text: string): Promise<number[]> {
      if (!semantic()) return [];
      try {
        // 走严格路径：真 provider fetch 失败会 throw（而非静默哈希兜底），此处 catch 降级 []
        return coerceVec1024(await service.embedSemanticStrict(text));
      } catch (e) {
        console.warn('[semanticEmbed] 语义向量失败，降级 []:', (e as Error).message);
        return [];
      }
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (!semantic()) return texts.map(() => []);
      try {
        const rows = await Promise.all(texts.map((t) => service.embedSemanticStrict(t)));
        return rows.map(coerceVec1024);
      } catch (e) {
        console.warn('[semanticEmbedBatch] 语义向量失败，降级 []:', (e as Error).message);
        return texts.map(() => []);
      }
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

/**
 * 本地 ASR-like 解析：从 assets.content 直接做正则切分（说话人/时间戳）。
 * 不调用 LLM；用来在没有外部 ASR 服务时保证 ingest 步骤真实落库。
 */
export function createLocalAssetsAiAdapter(
  db: DatabaseAdapter,
): AssetsAiAdapter {
  return {
    async parseMeeting(assetId: string): Promise<ParsedMeeting> {
      const r = await db.query(
        `SELECT id, title, content, metadata FROM assets WHERE id = $1`,
        [assetId],
      );
      const row = r.rows[0];
      if (!row) return { assetId };
      const raw = typeof row.content === 'string' ? row.content : '';
      if (!raw.trim()) {
        return { assetId, title: row.title ?? undefined, transcript: '', segments: [], participants: [] };
      }
      const parsed = parseTranscript(raw);
      // 落库到 metadata.parse（幂等覆写）
      try {
        await db.query(
          `UPDATE assets
              SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'parse', $2::jsonb,
                'parsed_at', NOW()::text
              )
            WHERE id = $1`,
          [assetId, JSON.stringify({
            stats: parsed.stats,
            segmentCount: parsed.segments.length,
            participants: parsed.participants,
            // 全量 segments 体积可能较大，只在必要时存 head + tail
            segmentsHead: parsed.segments.slice(0, 10),
          })],
        );
      } catch (e) {
        console.warn('[meeting-notes] persist parse stats failed:', (e as Error).message);
      }
      return {
        assetId,
        title: row.title ?? undefined,
        transcript: raw,
        segments: parsed.segments.map((s) => ({
          speaker: s.speaker,
          start: s.start,
          end: s.end,
          text: s.text,
        })),
        participants: parsed.participants.map((p) => ({ name: p.name })),
        metadata: { stats: parsed.stats },
      };
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

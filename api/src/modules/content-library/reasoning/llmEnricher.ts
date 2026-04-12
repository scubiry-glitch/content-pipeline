// Content Library v7.2 — 通用 LLM 增强管线
// 把候选数据 + prompt 模板 → 结构化叙事
// 被 synthesizeInsights (⑩) 和 getTopicRecommendations (①) 共用

import type { LLMAdapter } from '../types.js';

export interface EnrichParams<T, R> {
  items: T[];
  systemPrompt: string;
  buildUserPrompt: (items: T[]) => string;
  parseResponse: (raw: string) => R[];
  maxTokens?: number;
  fallback?: R[];
}

export interface EnrichResult<R> {
  enriched: R[];
  error?: string;
}

export class LLMEnricher {
  private llm: LLMAdapter;

  constructor(llm: LLMAdapter) {
    this.llm = llm;
  }

  async enrich<T, R>(params: EnrichParams<T, R>): Promise<EnrichResult<R>> {
    if (params.items.length === 0) {
      return { enriched: params.fallback || [] };
    }

    const userPrompt = params.buildUserPrompt(params.items);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llm.completeWithSystem(
          params.systemPrompt,
          userPrompt,
          {
            temperature: attempt === 0 ? 0.3 : 0.1,
            maxTokens: params.maxTokens || 2048,
            responseFormat: 'json',
          }
        );

        // 容错 JSON 解析
        let cleaned = raw.trim();
        const fence = /```(?:json)?\s*([\s\S]*?)```/i;
        const fm = cleaned.match(fence);
        if (fm) cleaned = fm[1].trim();
        cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          const arrMatch = cleaned.match(/\[[\s\S]*\]/);
          const objMatch = cleaned.match(/\{[\s\S]*\}/);
          if (arrMatch) {
            try { parsed = JSON.parse(arrMatch[0]); } catch { /* */ }
          }
          if (!parsed && objMatch) {
            try { parsed = JSON.parse(objMatch[0]); } catch { /* */ }
          }
        }

        if (!parsed) {
          if (attempt === 0) continue;
          return { enriched: params.fallback || [], error: 'JSON parse failed after 2 attempts' };
        }

        const enriched = params.parseResponse(typeof parsed === 'string' ? JSON.parse(parsed) : parsed);
        return { enriched };
      } catch (err) {
        if (attempt === 0) continue;
        return {
          enriched: params.fallback || [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { enriched: params.fallback || [], error: 'Unexpected' };
  }
}

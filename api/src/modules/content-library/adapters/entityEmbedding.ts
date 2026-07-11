// content_entities 专用 1024 语义嵌入适配器（与 HybridSearch 的 deps.embedding 解耦）。
// 语义门控：local→[]；真 provider→embedSemanticStrict 原生 1024→coerce；失败→[]。
import { getEmbeddingService, type EmbeddingService } from '../../../services/assets-ai/embedding.js';
import type { EmbeddingAdapter } from '../types.js';

function coerceVec1024(v: number[]): number[] {
  if (v.length === 1024) return v;
  if (v.length > 1024) return v.slice(0, 1024);
  const out = v.slice();
  while (out.length < 1024) out.push(0);
  return out;
}

export function createEntityEmbeddingAdapter(
  service: EmbeddingService = getEmbeddingService(),
): EmbeddingAdapter {
  const semantic = () => service.provider !== 'local';
  return {
    async embed(text: string): Promise<number[]> {
      if (!semantic()) return [];
      try {
        return coerceVec1024(await service.embedSemanticStrict(text));
      } catch (e) {
        console.warn('[entityEmbed] 语义向量失败，降级 []:', (e as Error).message);
        return [];
      }
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      if (!semantic()) return texts.map(() => []);
      try {
        const rows = await Promise.all(texts.map((t) => service.embedSemanticStrict(t)));
        return rows.map(coerceVec1024);
      } catch (e) {
        console.warn('[entityEmbedBatch] 语义向量失败，降级 []:', (e as Error).message);
        return texts.map(() => []);
      }
    },
  };
}

import { describe, it, expect, vi } from 'vitest';
import { createSemanticEmbeddingAdapter } from '../../../src/modules/meeting-notes/adapters/pipeline.js';

function fakeService(provider: string, embedImpl: (t: string) => Promise<number[]>) {
  return { provider, embed: vi.fn(embedImpl) } as any;
}

describe('createSemanticEmbeddingAdapter', () => {
  it('真 provider：返回 coerce 到 768 维的向量', async () => {
    const svc = fakeService('siliconflow', async () => new Array(4).fill(0.5));
    const ad = createSemanticEmbeddingAdapter(svc);
    const v = await ad.embed('张伟');
    expect(v).toHaveLength(768);
    expect(v[0]).toBe(0.5);
    expect(v[4]).toBe(0); // 补零
  });

  it('provider=local：返回 [] （不写垃圾向量）', async () => {
    const svc = fakeService('local', async () => new Array(768).fill(0.1));
    const ad = createSemanticEmbeddingAdapter(svc);
    expect(await ad.embed('张伟')).toEqual([]);
    expect(svc.embed).not.toHaveBeenCalled(); // 门控在调用前短路
  });

  it('真 provider 抛错：降级 [] 不抛穿', async () => {
    const svc = fakeService('openai', async () => { throw new Error('timeout'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createSemanticEmbeddingAdapter(svc);
    expect(await ad.embed('张伟')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('embedBatch 抛错：降级全空数组不抛穿，并 console.warn', async () => {
    const svc = fakeService('siliconflow', async () => { throw new Error('network error'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createSemanticEmbeddingAdapter(svc);
    const result = await ad.embedBatch(['a', 'b']);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([]);
    expect(result[1]).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('embedBatch：真 provider coerce 每条；local 全 []', async () => {
    const real = createSemanticEmbeddingAdapter(fakeService('siliconflow', async () => new Array(768).fill(1)));
    expect((await real.embedBatch(['a', 'b'])).map((r) => r.length)).toEqual([768, 768]);
    const local = createSemanticEmbeddingAdapter(fakeService('local', async () => new Array(768).fill(1)));
    expect(await local.embedBatch(['a', 'b'])).toEqual([[], []]);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createSemanticEmbeddingAdapter } from '../../../src/modules/meeting-notes/adapters/pipeline.js';

// 适配器现在走 service.embedSemanticStrict（严格语义路径：真 provider 失败即抛，
// 绝不静默替换成本地哈希向量）。fakeService 相应暴露 embedSemanticStrict。
function fakeService(provider: string, strictImpl: (t: string) => Promise<number[]>) {
  return { provider, embedSemanticStrict: vi.fn(strictImpl) } as any;
}

describe('createSemanticEmbeddingAdapter', () => {
  it('真 provider：返回 coerce 到 1024 维的向量', async () => {
    const svc = fakeService('siliconflow', async () => new Array(4).fill(0.5));
    const ad = createSemanticEmbeddingAdapter(svc);
    const v = await ad.embed('张伟');
    expect(v).toHaveLength(1024);
    expect(v[0]).toBe(0.5);
    expect(v[4]).toBe(0); // 补零
  });

  it('provider=local：返回 [] （不写垃圾向量）', async () => {
    const svc = fakeService('local', async () => new Array(1024).fill(0.1));
    const ad = createSemanticEmbeddingAdapter(svc);
    expect(await ad.embed('张伟')).toEqual([]);
    expect(svc.embedSemanticStrict).not.toHaveBeenCalled(); // 门控在调用前短路
  });

  it('真 provider 抛错：降级 [] 不抛穿', async () => {
    const svc = fakeService('openai', async () => { throw new Error('timeout'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createSemanticEmbeddingAdapter(svc);
    expect(await ad.embed('张伟')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // I1 回归：provider='siliconflow'（真 key 设置）但严格路径抛错（API 挂/限流/超时），
  // 适配器必须落 []，绝不写入哈希向量（否则 P4 会出现 FALSE auto-merge）。
  it('I1: 真 provider siliconflow 严格路径抛错 → embed 落 [] 而非哈希向量，并 warn', async () => {
    const svc = fakeService('siliconflow', async () => { throw new Error('SiliconFlow API error: 429'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createSemanticEmbeddingAdapter(svc);
    const v = await ad.embed('张伟');
    expect(v).toEqual([]);
    expect(v).toHaveLength(0); // 不是 1024 维哈希向量
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
    const real = createSemanticEmbeddingAdapter(fakeService('siliconflow', async () => new Array(1024).fill(1)));
    expect((await real.embedBatch(['a', 'b'])).map((r) => r.length)).toEqual([1024, 1024]);
    const local = createSemanticEmbeddingAdapter(fakeService('local', async () => new Array(1024).fill(1)));
    expect(await local.embedBatch(['a', 'b'])).toEqual([[], []]);
  });
});

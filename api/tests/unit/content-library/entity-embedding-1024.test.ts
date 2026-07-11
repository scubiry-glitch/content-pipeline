import { describe, it, expect, vi } from 'vitest';
import { createEntityEmbeddingAdapter } from '../../../src/modules/content-library/adapters/entityEmbedding.js';

function fake(provider: string, embed: (t: string) => Promise<number[]>) {
  return { provider, embedSemanticStrict: vi.fn(embed) } as any;
}

describe('createEntityEmbeddingAdapter (1024)', () => {
  it('真 provider → coerce 到 1024', async () => {
    const ad = createEntityEmbeddingAdapter(fake('siliconflow', async () => new Array(4).fill(0.5)));
    const v = await ad.embed('欧莱雅');
    expect(v).toHaveLength(1024);
    expect(v[0]).toBe(0.5);
  });
  it('local → [] 不写垃圾', async () => {
    const svc = fake('local', async () => new Array(1024).fill(0.1));
    const ad = createEntityEmbeddingAdapter(svc);
    expect(await ad.embed('x')).toEqual([]);
    expect(svc.embedSemanticStrict).not.toHaveBeenCalled();
  });
  it('真 provider 抛错 → [] 降级', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ad = createEntityEmbeddingAdapter(fake('siliconflow', async () => { throw new Error('x'); }));
    expect(await ad.embed('x')).toEqual([]);
    warn.mockRestore();
  });
});

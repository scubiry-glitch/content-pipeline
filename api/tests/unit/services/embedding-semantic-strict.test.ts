import { describe, it, expect, vi, afterEach } from 'vitest';
import { EmbeddingService } from '../../../src/services/assets-ai/embedding.js';

// I1: embedSemanticStrict 必须对真 provider 的 fetch 失败 THROW，绝不静默替换成本地哈希向量。
//     provider==='local' 时直接返回 [] 且不 fetch。
// I2: 真 provider fetch 携带 AbortController 超时（abort → reject → strict 抛穿）。
// 全部通过 vi.stubGlobal('fetch', ...) mock，无真实网络。

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('EmbeddingService.embedSemanticStrict', () => {
  it('provider=local → 返回 [] 且不 fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const svc = new EmbeddingService({ provider: 'siliconflow', apiKey: 'k' });
    svc.updateConfig({ provider: 'local' }); // 强制本地兜底 provider
    expect(svc.provider).toBe('local');
    const v = await svc.embedSemanticStrict('张伟');
    expect(v).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('真 provider (siliconflow) fetch reject → THROW（不返回哈希向量）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const svc = new EmbeddingService({ provider: 'siliconflow', apiKey: 'k' });
    expect(svc.provider).toBe('siliconflow');
    await expect(svc.embedSemanticStrict('张伟')).rejects.toThrow();
  });

  it('真 provider (siliconflow) fetch abort/超时 → THROW', async () => {
    // 模拟 AbortController 触发：fetch 因 signal.abort 而 reject
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      return await new Promise((_resolve, reject) => {
        const signal: AbortSignal = init.signal;
        if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')));
      });
    }));
    process.env.EMBEDDING_TIMEOUT_MS = '20'; // 极短超时，快速触发 abort
    const svc = new EmbeddingService({ provider: 'siliconflow', apiKey: 'k' });
    await expect(svc.embedSemanticStrict('张伟')).rejects.toThrow();
    delete process.env.EMBEDDING_TIMEOUT_MS;
  });

  it('真 provider (siliconflow) 非 200 → THROW（不静默兜底）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    })));
    const svc = new EmbeddingService({ provider: 'siliconflow', apiKey: 'k' });
    await expect(svc.embedSemanticStrict('张伟')).rejects.toThrow(/429/);
  });

  it('真 provider (siliconflow) fetch 成功 → 返回真实向量', async () => {
    const embedding = new Array(768).fill(0).map((_, i) => i / 768);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ embedding, index: 0 }], model: 'm', usage: {} }),
    })));
    const svc = new EmbeddingService({ provider: 'siliconflow', apiKey: 'k' });
    const v = await svc.embedSemanticStrict('张伟');
    expect(v).toEqual(embedding);
  });

  it('backward-compat: embed() 在 fetch reject 时仍静默降级本地哈希向量（非空）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const svc = new EmbeddingService({ provider: 'siliconflow', apiKey: 'k' });
    const v = await svc.embed('张伟'); // 旧路径：不抛，返回本地兜底
    expect(v.length).toBeGreaterThan(0); // 非空（哈希向量）— asset 向量化行为不变
    errSpy.mockRestore();
  });
});

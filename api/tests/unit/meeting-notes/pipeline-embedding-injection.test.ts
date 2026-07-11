import { describe, it, expect, vi } from 'vitest';
import { createPipelineDeps } from '../../../src/modules/meeting-notes/adapters/pipeline.js';

describe('createPipelineDeps embedding 注入', () => {
  const minimalInput = {
    db: { query: vi.fn() },
    experts: { listExperts: vi.fn(), invokeExpert: vi.fn() },
    expertApplication: { resolveForMeetingKind: vi.fn(), shouldSkipExpertAnalysis: vi.fn() },
  } as any;

  it('显式传入的 embedding 适配器被采用（而非 noop）', () => {
    const marker = { embed: vi.fn(async () => [1, 2, 3]), embedBatch: vi.fn(async () => [[1]]) };
    const deps = createPipelineDeps({ ...minimalInput, embedding: marker });
    expect(deps.embedding).toBe(marker);
  });

  it('未传 embedding → 回退 noop（embed 返回 []）', async () => {
    const deps = createPipelineDeps({ ...minimalInput });
    expect(await deps.embedding.embed('x')).toEqual([]);
  });
});

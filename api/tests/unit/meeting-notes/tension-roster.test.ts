import { describe, it, expect, vi } from 'vitest';
import { computeTensions } from '../../../src/modules/meeting-notes/axes/tension/tensionComputer.js';

function makeDeps(llmResponse: string) {
  const query = vi.fn(async (sql: string) => {
    if (/FROM assets/i.test(sql)) return { rows: [{ id: 'm1', title: 't', content: 'c', metadata: {} }] };
    return { rows: [{ id: 'row1' }] };
  });
  const deps: any = {
    db: { query },
    llm: { complete: vi.fn(), completeWithSystem: vi.fn().mockResolvedValue(llmResponse) },
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    expertApplication: { resolveForMeetingKind: vi.fn(() => null), shouldSkipExpertAnalysis: vi.fn(() => false) },
  };
  return { deps, query };
}

describe('tension · roster', () => {
  it('循环内每个 participant 走 roster，命不中不造人', async () => {
    const { deps, query } = makeDeps(JSON.stringify([{ between: ['张三', '陌生人'], topic: 't', summary: 's' }]));
    const roster = { resolveAsync: vi.fn(async (n: string) => (n === '张三' ? 'mp-a' : null)) } as any;
    await computeTensions(deps, { meetingId: 'm1', personRoster: roster });
    expect(roster.resolveAsync).toHaveBeenCalledWith('张三');
    expect(roster.resolveAsync).toHaveBeenCalledWith('陌生人');
    expect(query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]))).toBe(false);
  });
});

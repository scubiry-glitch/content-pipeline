import { describe, it, expect, vi } from 'vitest';
import { computeCounterfactuals } from '../../../src/modules/meeting-notes/axes/knowledge/counterfactualsComputer.js';

function makeDeps(llmResponse: string) {
  const query = vi.fn(async (sql: string) => {
    if (/FROM assets/i.test(sql)) return { rows: [{ id: 'm1', title: 't', content: 'c', metadata: {} }] };
    if (/INSERT INTO mn_counterfactuals/i.test(sql)) return { rows: [{ id: 'cf1' }] };
    return { rows: [] };
  });
  const deps: any = {
    db: { query },
    llm: { complete: vi.fn(), completeWithSystem: vi.fn().mockResolvedValue(llmResponse) },
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    expertApplication: { resolveForMeetingKind: vi.fn(() => null), shouldSkipExpertAnalysis: vi.fn(() => false) },
  };
  return { deps, query };
}

describe('counterfactuals · roster', () => {
  it('personRoster 命中 → 用 roster id，不造人', async () => {
    const { deps, query } = makeDeps(JSON.stringify([{ rejected_by: '李四', claim: 'x', reason: 'y' }]));
    const roster = { resolveAsync: vi.fn(async () => 'mp-x') } as any;
    await computeCounterfactuals(deps, { meetingId: 'm1', personRoster: roster });
    expect(roster.resolveAsync).toHaveBeenCalledWith('李四');
    expect(query.mock.calls.some((c: any) => /INSERT INTO mn_people/i.test(c[0]))).toBe(false);
  });
});

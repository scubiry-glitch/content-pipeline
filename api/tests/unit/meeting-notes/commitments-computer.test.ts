/**
 * axes/people/commitmentsComputer — end-to-end with full dep mocks
 *
 * 验证：
 *   1. 从 assets 读取 meeting bundle
 *   2. LLM 被调用并解析 JSON 返回数组
 *   3. 每条 commitment 先 ensurePersonByName，再 INSERT mn_commitments
 *   4. replaceExisting=true 会先 DELETE
 *   5. expertApplication.shouldSkipExpertAnalysis('internal_ops') → 跳过 LLM
 */
import { describe, it, expect, vi } from 'vitest';
import { computeCommitments } from '../../../src/modules/meeting-notes/axes/people/commitmentsComputer.js';

function makeDeps(opts: {
  meetingRow?: any;
  personLookup?: any[];
  personInsertId?: string;
  llmResponse?: string;
  skipExpert?: boolean;
} = {}) {
  const query = vi.fn();
  const defaultMeeting = {
    id: 'm1', title: 'Strategy', content: '张三承诺本周完成压测',
    metadata: { meeting_kind: 'strategy_roadshow' },
  };

  // Pre-programmed SQL responses
  // 1. loadMeetingBundle SELECT from assets → meetingRow
  // 2. DELETE (if replaceExisting)
  // 3..N. For each item: ensurePersonByName lookup + insert, then mn_commitments insert

  query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM assets')) {
      return { rows: [opts.meetingRow ?? defaultMeeting] };
    }
    if (sql.includes('DELETE FROM mn_commitments')) return { rowCount: 0, rows: [] };
    if (sql.includes('SELECT id FROM mn_people')) {
      return { rows: opts.personLookup ?? [] };
    }
    if (sql.includes('INSERT INTO mn_people')) {
      return { rows: [{ id: opts.personInsertId ?? 'p-new' }] };
    }
    if (sql.includes('UPDATE mn_people')) return { rows: [] };
    if (sql.includes('INSERT INTO mn_commitments')) {
      return { rows: [{ id: `c-${Math.random()}` }] };
    }
    return { rows: [] };
  });

  const llm = {
    complete: vi.fn(),
    completeWithSystem: vi.fn().mockResolvedValue(
      opts.llmResponse ?? JSON.stringify([
        { who: '张三', text: '压测', due_at: null, state: 'on_track' },
      ]),
    ),
  };
  const expertApplication = {
    resolveForMeetingKind: vi.fn(() => null),
    shouldSkipExpertAnalysis: vi.fn(() => !!opts.skipExpert),
  };

  const deps: any = {
    db: { query },
    llm,
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    experts: { invoke: vi.fn() },
    expertApplication,
    assetsAi: { parseMeeting: vi.fn() },
    eventBus: { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
    textSearch: { search: vi.fn(), index: vi.fn() },
  };
  return { deps, query, llm, expertApplication };
}

describe('computeCommitments', () => {
  it('extracts commitments and inserts rows', async () => {
    const { deps, query, llm } = makeDeps();
    const result = await computeCommitments(deps, { meetingId: 'm1' });
    expect(result.created).toBe(1);
    expect(result.errors).toBe(0);
    expect(llm.completeWithSystem).toHaveBeenCalledOnce();
    // 验证 INSERT mn_commitments 被调用
    const inserts = query.mock.calls.filter((c: any) => c[0].includes('INSERT INTO mn_commitments'));
    expect(inserts.length).toBe(1);
    expect(inserts[0][1][0]).toBe('m1');       // meeting_id
    expect(inserts[0][1][4]).toBe('on_track'); // state
  });

  it('replaceExisting=true triggers DELETE first', async () => {
    const { deps, query } = makeDeps();
    await computeCommitments(deps, { meetingId: 'm1', replaceExisting: true });
    const hasDelete = query.mock.calls.some((c: any) =>
      c[0].includes('DELETE FROM mn_commitments'),
    );
    expect(hasDelete).toBe(true);
  });

  it('skips when meeting asset not found', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [] });  // loadMeetingBundle miss
    const deps: any = {
      db: { query },
      llm: { complete: vi.fn(), completeWithSystem: vi.fn() },
      expertApplication: {
        resolveForMeetingKind: vi.fn(() => null),
        shouldSkipExpertAnalysis: vi.fn(() => false),
      },
    };
    const result = await computeCommitments(deps, { meetingId: 'm-missing' });
    expect(result.created).toBe(0);
    expect(deps.llm.completeWithSystem).not.toHaveBeenCalled();
  });

  it('internal_ops short-circuits LLM call but still returns 0 inserts', async () => {
    const { deps, llm } = makeDeps({ skipExpert: true, llmResponse: '' });
    const result = await computeCommitments(deps, { meetingId: 'm1' });
    // LLM 仍被调用（callExpertOrLLM 内部判断后返回 ''），但 JSON parse 空数组 → 无插入
    expect(result.created).toBe(0);
    expect(llm.completeWithSystem).not.toHaveBeenCalled();  // shouldSkipExpertAnalysis=true → 直接返回 ''
  });

  it('tolerates LLM returning fenced JSON', async () => {
    const { deps } = makeDeps({
      llmResponse: '```json\n[{"who":"李四","text":"x","state":"done"}]\n```',
    });
    const result = await computeCommitments(deps, { meetingId: 'm1' });
    expect(result.created).toBe(1);
  });

  it('does not insert when person cannot be created', async () => {
    // ensurePersonByName 返回 null（名字被标准化为空）
    // 场景：who 是 "()" 之类
    const { deps } = makeDeps({
      llmResponse: JSON.stringify([{ who: '', text: 'ghost', state: 'on_track' }]),
    });
    const result = await computeCommitments(deps, { meetingId: 'm1' });
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

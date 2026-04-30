/**
 * oneshotRunner — runOneshotMode + 内部 helpers
 *
 * 关注：
 *   1. runOneshotMode 调用 deps.llm.completeWithSystem 一次，传入 buildFullPrompt 输出
 *   2. 返回结构与 ClaudeCliRunnerResult 同形（meeting/participants/analysis/axes/facts/wikiMarkdown），sessionId 恒 null
 *   3. 第一次返回 invalid JSON 时温度 0.2 → 0.4 重试 1 次
 *   4. 重试仍失败 → 调 hooks.recordOneshotRaw 后 throw
 *   5. helpers parseInnerJson / validateOneshotSchema
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runOneshotMode,
  __test__,
  type OneshotRunnerCtx,
  type OneshotRunnerHooks,
} from '../../../src/modules/meeting-notes/runs/oneshotRunner.js';

const { parseInnerJson, validateOneshotSchema } = __test__;

// ── helpers tests ────────────────────────────────────────────

describe('parseInnerJson', () => {
  it('parses plain JSON', () => {
    expect(parseInnerJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"x":1}\n```';
    expect(parseInnerJson(raw)).toEqual({ ok: true, value: { x: 1 } });
  });

  it('extracts JSON from leading prose', () => {
    const raw = 'Here is the result:\n{"k":"v"}\nThanks.';
    expect(parseInnerJson(raw)).toEqual({ ok: true, value: { k: 'v' } });
  });

  it('returns ok=false on irrecoverable input', () => {
    const r = parseInnerJson('not json at all');
    expect(r.ok).toBe(false);
  });
});

describe('validateOneshotSchema', () => {
  it('rejects non-object', () => {
    const r = validateOneshotSchema(null, 'meeting');
    expect(r.ok).toBe(false);
  });

  it('rejects meeting without analysis', () => {
    const r = validateOneshotSchema({ axes: {}, participants: [] }, 'meeting');
    expect(r.ok).toBe(false);
  });

  it('accepts meeting with required fields', () => {
    const parsed = {
      analysis: {
        summary: { actionItems: [] },
        tension: [], newCognition: [], focusMap: [], consensus: [], crossView: [],
      },
      axes: {},
      participants: [],
    };
    expect(validateOneshotSchema(parsed, 'meeting')).toEqual({ ok: true });
  });

  it('accepts scope with scopeUpdates', () => {
    expect(validateOneshotSchema({ scopeUpdates: {} }, 'scope')).toEqual({ ok: true });
  });

  it('rejects scope without scopeUpdates', () => {
    const r = validateOneshotSchema({}, 'scope');
    expect(r.ok).toBe(false);
  });
});

// ── runOneshotMode integration tests ─────────────────────────

function buildValidInner() {
  return JSON.stringify({
    meeting: { id: 'm1', title: 'T1' },
    participants: [{ id: 'p1', name: 'Alice' }],
    analysis: {
      summary: { actionItems: [] },
      tension: [], newCognition: [], focusMap: [], consensus: [], crossView: [],
    },
    axes: { people: {}, projects: {}, knowledge: {}, meta: {}, tension: {} },
    facts: [{ subject: 's', predicate: 'p', object: 'o' }],
    wikiMarkdown: { sourceEntry: '## meeting' },
  });
}

function makeDeps(llmStub: ReturnType<typeof vi.fn>): any {
  return {
    db: {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM assets')) {
          // Provide a transcript long enough to pass the 50-char floor
          return {
            rows: [{
              content:
                'Alice: hello team\nBob: lets discuss the roadmap\n' +
                'Alice: q1 priorities are alignment and delivery\nBob: agreed',
            }],
          };
        }
        return { rows: [] };
      }),
    },
    llm: { complete: vi.fn(), completeWithSystem: llmStub },
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    experts: { invoke: vi.fn() },
    expertApplication: { resolveForMeetingKind: () => null, shouldSkipExpertAnalysis: () => false },
    assetsAi: { parseMeeting: vi.fn() },
    eventBus: { publish: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() },
    textSearch: { search: vi.fn(), index: vi.fn() },
  };
}

function makeCtx(overrides: Partial<OneshotRunnerCtx> = {}): OneshotRunnerCtx {
  return {
    expertRoles: null,
    expertSnapshots: new Map(),
    preset: 'lite',
    decoratorChain: ['failure_check'],
    scopeConfig: null,
    meetingKind: 'general',
    meetingTitle: 'Demo Meeting',
    participantsFromParse: [{ id: 'uuid-alice', name: 'Alice' }, { id: 'uuid-bob', name: 'Bob' }],
    promptKind: 'meeting',
    ...overrides,
  };
}

function makeHooks(): OneshotRunnerHooks & { recorded: string[] } {
  const recorded: string[] = [];
  return {
    recorded,
    writeStep: vi.fn(async () => {}),
    bumpUsage: vi.fn(),
    recordOneshotRaw: vi.fn(async (raw: string) => { recorded.push(raw); }),
  };
}

describe('runOneshotMode', () => {
  it('calls deps.llm.completeWithSystem once with buildFullPrompt output and returns same-shape result', async () => {
    const llmStub = vi.fn(async (system: string) => {
      // Sanity-check that buildFullPrompt content shows up in system prompt
      expect(system).toContain('Demo Meeting');
      return buildValidInner();
    });
    const deps = makeDeps(llmStub);
    const hooks = makeHooks();

    const result = await runOneshotMode(
      deps,
      { runId: 'run-1', meetingId: 'm1', assetId: 'a1' },
      makeCtx(),
      hooks,
    );

    expect(llmStub).toHaveBeenCalledTimes(1);
    expect(llmStub.mock.calls[0][2]).toMatchObject({ responseFormat: 'json', temperature: 0.2 });
    expect(result.sessionId).toBeNull();
    expect(result.meeting).toMatchObject({ title: 'T1' });
    expect(result.participants).toHaveLength(1);
    expect(result.analysis.summary).toBeDefined();
    expect(result.axes).toBeDefined();
    expect(Array.isArray(result.facts)).toBe(true);
    expect(result.wikiMarkdown).toBeDefined();
    // cliPersonMap built from participantsFromParse: p1→uuid-alice, p2→uuid-bob
    expect(result.cliPersonMap).toEqual({ p1: 'uuid-alice', p2: 'uuid-bob' });
  });

  it('retries once with temperature 0.4 when first response is invalid JSON', async () => {
    const llmStub = vi.fn()
      .mockResolvedValueOnce('this is not json at all')
      .mockResolvedValueOnce(buildValidInner());
    const deps = makeDeps(llmStub);
    const hooks = makeHooks();

    const result = await runOneshotMode(
      deps,
      { runId: 'run-2', meetingId: 'm1', assetId: 'a1' },
      makeCtx(),
      hooks,
    );

    expect(llmStub).toHaveBeenCalledTimes(2);
    expect(llmStub.mock.calls[0][2]).toMatchObject({ temperature: 0.2 });
    expect(llmStub.mock.calls[1][2]).toMatchObject({ temperature: 0.4 });
    expect(result.sessionId).toBeNull();
    expect(hooks.recorded).toHaveLength(0); // success on retry → no raw recorded
  });

  it('records raw + throws when both attempts fail', async () => {
    const llmStub = vi.fn().mockResolvedValue('still not json');
    const deps = makeDeps(llmStub);
    const hooks = makeHooks();

    await expect(
      runOneshotMode(
        deps,
        { runId: 'run-3', meetingId: 'm1', assetId: 'a1' },
        makeCtx(),
        hooks,
      ),
    ).rejects.toThrow(/oneshot output malformed/);

    expect(llmStub).toHaveBeenCalledTimes(2);
    expect(hooks.recorded).toHaveLength(1);
    expect(hooks.recorded[0]).toContain('still not json');
  });

  it('uses ctx.prebuiltPrompt for scope mode (skips buildFullPrompt + transcript load)', async () => {
    const llmStub = vi.fn(async (system: string) => {
      expect(system).toBe('PREBUILT-SCOPE-PROMPT');
      return JSON.stringify({ scopeUpdates: { judgmentsToReuse: [] } });
    });
    const deps = makeDeps(llmStub);
    // db.query for assets should NOT be called in scope mode
    const hooks = makeHooks();

    const result = await runOneshotMode(
      deps,
      { runId: 'run-4', meetingId: 'm1', assetId: 'a1' },
      makeCtx({ promptKind: 'scope', prebuiltPrompt: 'PREBUILT-SCOPE-PROMPT' }),
      hooks,
    );

    expect(deps.db.query).not.toHaveBeenCalled();
    expect(llmStub).toHaveBeenCalledTimes(1);
    expect(result.scopeUpdates).toEqual({ judgmentsToReuse: [] });
    expect(result.sessionId).toBeNull();
  });
});

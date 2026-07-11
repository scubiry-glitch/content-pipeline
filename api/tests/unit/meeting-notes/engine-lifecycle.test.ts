/**
 * integration: MeetingNotesEngine · 生命周期 / 事件订阅
 *
 * 验证 Engine 构造时：
 *   - 4 个内部服务被创建 (scopes / versionStore / crossLinks / longitudinal)
 *   - 订阅 'mn.run.completed' 事件 → 触发 crossLinks.recomputeForScope 与 longitudinal
 *
 * 不触碰真 DB；模拟所有 adapters，用 EventEmitter 作 eventBus。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { MeetingNotesEngine } from '../../../src/modules/meeting-notes/MeetingNotesEngine.js';
import { PersonRoster } from '../../../src/modules/meeting-notes/runs/personRoster.js';
import * as registry from '../../../src/modules/meeting-notes/axes/registry.js';

function makeEventBus() {
  const em = new EventEmitter();
  return {
    publish: vi.fn(async (e: string, p: any) => { em.emit(e, p); }),
    subscribe: vi.fn((e: string, h: (p: any) => Promise<void>) => {
      em.on(e, (p) => { h(p).catch(() => {}); });
    }),
    unsubscribe: vi.fn((e: string) => { em.removeAllListeners(e); }),
    _em: em,
  };
}

function makeDeps() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const eventBus = makeEventBus();
  const deps: any = {
    db: { query },
    llm: { complete: vi.fn(), completeWithSystem: vi.fn().mockResolvedValue('') },
    embedding: { embed: vi.fn(), embedBatch: vi.fn() },
    experts: { invoke: vi.fn() },
    expertApplication: {
      resolveForMeetingKind: vi.fn(() => null),
      shouldSkipExpertAnalysis: vi.fn(() => false),
    },
    assetsAi: { parseMeeting: vi.fn().mockResolvedValue({ assetId: 'm1' }) },
    eventBus,
    textSearch: { search: vi.fn(), index: vi.fn() },
  };
  return { deps, query, eventBus };
}

describe('MeetingNotesEngine construction', () => {
  it('wires all inner services', () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    expect(engine.scopes).toBeDefined();
    expect(engine.runEngine).toBeDefined();
    expect(engine.versionStore).toBeDefined();
    expect(engine.crossLinks).toBeDefined();
    expect(engine.longitudinal).toBeDefined();
  });

  it('subscribes to mn.run.completed on construction', () => {
    const { deps, eventBus } = makeDeps();
    new MeetingNotesEngine(deps);
    expect(eventBus.subscribe).toHaveBeenCalledWith('mn.run.completed', expect.any(Function));
  });

  it('health returns ok with version tag', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const h = await engine.health();
    expect(h.ok).toBe(true);
    expect(h.version).toMatch(/\d+\.\d+\.\d+/);
  });
});

describe('MeetingNotesEngine.enqueueRun + state', () => {
  it('creates run row with queued state', async () => {
    const { deps, query } = makeDeps();
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO mn_runs')) return { rows: [{ id: 'run-xyz' }] };
      if (sql.includes('SELECT metadata')) return { rows: [{ kind: null }] };
      return { rows: [] };
    });
    const engine = new MeetingNotesEngine(deps);
    const r = await engine.enqueueRun({
      scope: { kind: 'meeting', id: 'm1' },
      axis: 'people',
      subDims: ['commitments'],
      preset: 'standard',
    });
    expect(r.ok).toBe(true);
    expect(r.runId).toBe('run-xyz');
    const inserts = query.mock.calls.filter((c: any) => c[0].includes('INSERT INTO mn_runs'));
    expect(inserts.length).toBe(1);
  });

  it('getMeetingDetail returns view A sections', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const detail = await engine.getMeetingDetail('m1', 'A');
    expect(detail.view).toBe('A');
    expect(Array.isArray(detail.sections)).toBe(true);
    expect(detail.sections.length).toBeGreaterThan(0);
  });

  it('getMeetingDetail B returns three-column panels', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const detail = await engine.getMeetingDetail('m1', 'B');
    expect(detail.view).toBe('B');
    expect(detail.left).toBeDefined();
    expect(detail.center).toBeDefined();
    expect(detail.right).toBeDefined();
  });

  it('getMeetingDetail C returns node-centric view', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const detail = await engine.getMeetingDetail('m1', 'C');
    expect(detail.view).toBe('C');
    expect(Array.isArray(detail.nodes)).toBe(true);
  });
});

describe('computeAxis dispatch', () => {
  it('axis=all runs all four axes via registry', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const r = await engine.computeAxis({ meetingId: 'm1', axis: 'all' });
    expect(r.ok).toBe(true);
    // 16 computers × 1 run = up to 16 results (some may 0-created but still return ComputeResult)
    expect(r.results.length).toBeGreaterThanOrEqual(16);
  });

  it('axis=people limits to 4 sub-dims', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const r = await engine.computeAxis({ meetingId: 'm1', axis: 'people' });
    expect(r.results.length).toBe(4);
    const subDims = r.results.map((x: any) => x.subDim);
    expect(subDims).toEqual(
      expect.arrayContaining(['commitments', 'role_trajectory', 'speech_quality', 'silence_signal']),
    );
  });

  it('unknown axis returns reason', async () => {
    const { deps } = makeDeps();
    const engine = new MeetingNotesEngine(deps);
    const r = await engine.computeAxis({ meetingId: 'm1', axis: 'bogus' as any });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('unknown-axis');
  });
});

describe('runEngine execute · PersonRoster flag 门控', () => {
  // 最小 payload 让 execute() 走进 multi-axis 分支
  const minPayload = {
    runId: 'run-r1',
    scope: { kind: 'meeting' as const, id: 'meet-1' },
    axis: 'people' as const,
    subDims: [] as string[],
    preset: 'standard' as const,
    strategySpec: null,
    triggeredBy: 'manual' as const,
    parentRunId: null,
    meetingId: 'meet-1',
    mode: undefined as any,  // → multi-axis 默认分支
  };

  function makeDepsForExecute() {
    // DB mock：
    //   UPDATE mn_runs SET state='running'... RETURNING id  → rows=[{id:'run-r1'}]（通过 claim 检查）
    //   PersonRoster.build 内部的 SELECT FROM mn_people... → rows=[]（空花名册，合法）
    //   所有其它 SQL → rows=[]
    const query = vi.fn(async (sql: string) => {
      if (/UPDATE mn_runs/i.test(sql) && /RETURNING id/i.test(sql)) {
        return { rows: [{ id: 'run-r1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const eventBus = makeEventBus();
    const deps: any = {
      db: { query },
      llm: { complete: vi.fn(), completeWithSystem: vi.fn().mockResolvedValue('') },
      embedding: { embed: vi.fn().mockResolvedValue([]), embedBatch: vi.fn() },
      experts: { invoke: vi.fn() },
      expertApplication: {
        resolveForMeetingKind: vi.fn(() => null),
        shouldSkipExpertAnalysis: vi.fn(() => false),
      },
      assetsAi: { parseMeeting: vi.fn().mockResolvedValue({ assetId: 'meet-1' }) },
      eventBus,
      textSearch: { search: vi.fn(), index: vi.fn() },
    };
    return { deps, query };
  }

  let buildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // spy PersonRoster.build so we can track calls and return a controlled instance
    buildSpy = vi.spyOn(PersonRoster, 'build');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('MN_PERSON_ROSTER=1 时 execute 调用 PersonRoster.build 并把 personRoster 注入 runAxisAll args', async () => {
    vi.stubEnv('MN_PERSON_ROSTER', '1');

    const { deps } = makeDepsForExecute();

    // Capture all ComputeArgs objects passed to runAxisAll so we can assert personRoster injection.
    // vi.spyOn works here because TypeScript compiles to CommonJS and the compiled runEngine.ts
    // resolves `runAxisAll` from the module exports object at call-time, not via a closed-over
    // local variable — so replacing the export property intercepts every call.
    const capturedArgs: any[] = [];
    const runAxisAllSpy = vi.spyOn(registry, 'runAxisAll').mockImplementation(
      async (_deps, _axis, args, _subDims) => {
        capturedArgs.push(args);
        return [];
      },
    );

    const engine = new MeetingNotesEngine(deps);

    // 直接调用私有 execute()
    await (engine.runEngine as any).execute(minPayload);

    // runAxisAll 必须被调用（multi-axis 路径）
    expect(runAxisAllSpy).toHaveBeenCalled();

    // PersonRoster.build 必须被调用（表明 roster 被构建）
    expect(buildSpy).toHaveBeenCalledWith(deps, 'meet-1');

    // 每次 runAxisAll 调用时，args.personRoster 必须是 PersonRoster 实例（非 null）
    // 这是核心断言：删除 runEngine.ts args literal 中的 `personRoster,` 会让此处失败
    expect(capturedArgs.length).toBeGreaterThan(0);
    for (const args of capturedArgs) {
      expect(args.personRoster).toBeInstanceOf(PersonRoster);
    }

    runAxisAllSpy.mockRestore();
  });

  it('MN_PERSON_ROSTER 未设置时 execute 不调用 PersonRoster.build，runAxisAll args.personRoster 为 null', async () => {
    vi.stubEnv('MN_PERSON_ROSTER', '0');

    const { deps } = makeDepsForExecute();

    const capturedArgs: any[] = [];
    const runAxisAllSpy = vi.spyOn(registry, 'runAxisAll').mockImplementation(
      async (_deps, _axis, args, _subDims) => {
        capturedArgs.push(args);
        return [];
      },
    );

    const engine = new MeetingNotesEngine(deps);

    await (engine.runEngine as any).execute(minPayload);

    // flag 关闭时不应构建花名册
    expect(buildSpy).not.toHaveBeenCalled();

    // flag 关闭时 personRoster 必须为 null（非 PersonRoster 实例）
    for (const args of capturedArgs) {
      expect(args.personRoster).toBeNull();
    }

    runAxisAllSpy.mockRestore();
  });
});

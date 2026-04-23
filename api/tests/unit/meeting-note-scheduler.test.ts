/**
 * meetingNoteScheduler — cron-driven import trigger for meeting_note_sources.
 *
 * Behaviour contract:
 * - On start(): load all active sources with non-empty schedule_cron, register
 *   a cron task per source calling svc.runImport(id, 'scheduled').
 * - Bad cron strings are logged and skipped (don't crash the scheduler).
 * - Inactive sources or empty schedule_cron are never scheduled.
 * - reload() re-syncs after CRUD (called by the service on mutation).
 * - stop() cancels every task.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { validateMock, scheduleMock, stopMock } = vi.hoisted(() => ({
  validateMock: vi.fn((s: string) => /^[\s\S]+ [\s\S]+ [\s\S]+ [\s\S]+ [\s\S]+$/.test(s)),
  scheduleMock: vi.fn((_expr: string, fn: () => void) => ({
    stop: stopMock,
    _fire: fn,
  })),
  stopMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: scheduleMock, validate: validateMock },
  schedule: scheduleMock,
  validate: validateMock,
}));

import { MeetingNoteScheduler } from '../../src/services/meetingNoteScheduler.js';

function activeSrc(over: Partial<any> = {}): any {
  return {
    id: 's1', name: 'auto', kind: 'lark',
    config: {}, isActive: true, scheduleCron: '*/15 * * * *',
    lastImportedAt: null, createdBy: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  };
}

describe('MeetingNoteScheduler', () => {
  beforeEach(() => {
    validateMock.mockClear();
    scheduleMock.mockClear();
    stopMock.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('schedules a cron job for each active source with a valid cron', async () => {
    const svc = {
      listSources: vi.fn().mockResolvedValue([
        activeSrc({ id: 'a', scheduleCron: '*/15 * * * *' }),
        activeSrc({ id: 'b', scheduleCron: '0 */1 * * *' }),
      ]),
      runImport: vi.fn(),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(sched.activeCount).toBe(2);
  });

  it('skips sources with empty / null schedule_cron', async () => {
    const svc = {
      listSources: vi.fn().mockResolvedValue([
        activeSrc({ id: 'a', scheduleCron: null }),
        activeSrc({ id: 'b', scheduleCron: '' }),
        activeSrc({ id: 'c', scheduleCron: '*/15 * * * *' }),
      ]),
      runImport: vi.fn(),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(sched.activeCount).toBe(1);
  });

  it('skips invalid cron strings without throwing', async () => {
    validateMock.mockImplementationOnce(() => false); // first cron invalid
    const svc = {
      listSources: vi.fn().mockResolvedValue([
        activeSrc({ id: 'a', scheduleCron: 'nonsense' }),
        activeSrc({ id: 'b', scheduleCron: '*/15 * * * *' }),
      ]),
      runImport: vi.fn(),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(sched.activeCount).toBe(1);
    expect(sched.skipped).toEqual([{ sourceId: 'a', reason: 'invalid-cron' }]);
  });

  it('firing a scheduled task calls svc.runImport with triggeredBy=scheduled', async () => {
    let captured: (() => void) | null = null;
    scheduleMock.mockImplementationOnce((_expr: string, fn: () => void) => {
      captured = fn;
      return { stop: stopMock };
    });
    const svc = {
      listSources: vi.fn().mockResolvedValue([activeSrc({ id: 'a' })]),
      runImport: vi.fn().mockResolvedValue({ status: 'succeeded' }),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    expect(captured).not.toBeNull();
    await (captured as any)();
    expect(svc.runImport).toHaveBeenCalledWith('a', 'scheduled');
  });

  it('import failures inside a tick are swallowed (scheduler stays alive)', async () => {
    let captured: (() => void) | null = null;
    scheduleMock.mockImplementationOnce((_expr: string, fn: () => void) => {
      captured = fn;
      return { stop: stopMock };
    });
    const svc = {
      listSources: vi.fn().mockResolvedValue([activeSrc({ id: 'a' })]),
      runImport: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    await expect((captured as any)()).resolves.toBeUndefined();
  });

  it('reload() replaces the task set (stops old, schedules new)', async () => {
    const svc = {
      listSources: vi.fn()
        .mockResolvedValueOnce([activeSrc({ id: 'a' })])
        .mockResolvedValueOnce([
          activeSrc({ id: 'a' }),
          activeSrc({ id: 'b' }),
        ]),
      runImport: vi.fn(),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    expect(sched.activeCount).toBe(1);
    await sched.reload();
    expect(stopMock).toHaveBeenCalled();
    expect(sched.activeCount).toBe(2);
  });

  it('stop() cancels all scheduled tasks and flips isRunning', async () => {
    const svc = {
      listSources: vi.fn().mockResolvedValue([
        activeSrc({ id: 'a' }),
        activeSrc({ id: 'b' }),
      ]),
      runImport: vi.fn(),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    expect(sched.isRunning).toBe(true);
    sched.stop();
    expect(stopMock).toHaveBeenCalledTimes(2);
    expect(sched.isRunning).toBe(false);
    expect(sched.activeCount).toBe(0);
  });

  it('calling start() twice is a no-op', async () => {
    const svc = {
      listSources: vi.fn().mockResolvedValue([activeSrc()]),
      runImport: vi.fn(),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    await sched.start();
    expect(svc.listSources).toHaveBeenCalledTimes(1);
  });

  it('concurrent fires for the same source serialize (no overlap)', async () => {
    let captured: (() => Promise<void>) | null = null;
    scheduleMock.mockImplementationOnce((_expr: string, fn: any) => {
      captured = fn;
      return { stop: stopMock };
    });
    let inFlight = 0;
    let peak = 0;
    const svc = {
      listSources: vi.fn().mockResolvedValue([activeSrc({ id: 'a' })]),
      runImport: vi.fn().mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return { status: 'succeeded' };
      }),
    };
    const sched = new MeetingNoteScheduler(svc as any);
    await sched.start();
    // Fire three times rapidly; only one should actually start at once.
    await Promise.all([
      (captured as any)(),
      (captured as any)(),
      (captured as any)(),
    ]);
    expect(peak).toBe(1);
  });
});

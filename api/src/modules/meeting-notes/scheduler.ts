// Meeting Notes Scheduler — cron 触发定时重算
//
// PR5: 两个任务
//   · project-auto-incremental: 订阅 'mn.meeting.parsed' → 对该 meeting 所在 project scope
//     的 axis=all 自动 enqueueRun (triggeredBy='auto')
//   · library-monthly-recompute: 每月 1 日 02:00 对 LIBRARY 跑 axis=all + preset=standard
//
// 独立部署（standalone）模式也复用这同一个类，只需传入 engine。

import cron from 'node-cron';
import type { MeetingNotesEngine } from './MeetingNotesEngine.js';
import type { MeetingNotesDeps } from './types.js';

export interface SchedulerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  runLibraryNow(): Promise<string | null>;  // 手动立即触发 library 重算
}

const DEFAULT_LIBRARY_CRON = '0 2 1 * *';  // 每月 1 日 02:00

export function startMeetingNotesScheduler(
  engine: MeetingNotesEngine,
  options: { libraryCron?: string | null } = {},
): SchedulerHandle {
  const libraryCron = options.libraryCron === undefined
    ? DEFAULT_LIBRARY_CRON
    : options.libraryCron;

  let libraryTask: ReturnType<typeof cron.schedule> | null = null;
  let running = false;
  const deps = engine.deps as MeetingNotesDeps;

  // --- project auto-incremental ---
  // 订阅 meeting parsed 事件，对该 meeting 所在的 project scope 自动触发 run。
  // 同一 meeting 并发触发在 RunEngine 里由 queue 串行化，不会重复跑。
  const meetingParsedHandler = async (payload: any) => {
    const meetingId: string | undefined = payload?.assetId;
    if (!meetingId) return;
    try {
      const scopes = await engine.scopes.listScopesForMeeting(meetingId);
      const projects = scopes.filter((s) => s.kind === 'project');
      for (const p of projects) {
        await engine.enqueueRun({
          scope: { kind: 'project', id: p.id },
          axis: 'all',
          triggeredBy: 'auto',
        }).catch((e) => {
          console.error('[MeetingNotes/Scheduler] auto-enqueue failed:', (e as Error).message);
        });
      }
    } catch (e) {
      console.error('[MeetingNotes/Scheduler] project auto handler error:', (e as Error).message);
    }
  };

  // --- library monthly ---
  const libraryTick = async () => {
    console.log('[MeetingNotes/Scheduler] library monthly tick → enqueue');
    try {
      await engine.enqueueRun({
        scope: { kind: 'library' },
        axis: 'all',
        preset: 'standard',
        triggeredBy: 'schedule',
      });
    } catch (e) {
      console.error('[MeetingNotes/Scheduler] library tick failed:', (e as Error).message);
    }
  };

  return {
    async start() {
      if (running) return;
      running = true;

      deps.eventBus.subscribe('mn.meeting.parsed', meetingParsedHandler);

      if (libraryCron && cron.validate(libraryCron)) {
        libraryTask = cron.schedule(libraryCron, libraryTick);
        console.log(`[MeetingNotes/Scheduler] library cron active: ${libraryCron}`);
      } else if (libraryCron) {
        console.warn(`[MeetingNotes/Scheduler] invalid cron, library recompute disabled: ${libraryCron}`);
      }
    },

    async stop() {
      if (!running) return;
      running = false;
      deps.eventBus.unsubscribe('mn.meeting.parsed');
      if (libraryTask) {
        try { libraryTask.stop(); } catch { /* noop */ }
        libraryTask = null;
      }
    },

    async runLibraryNow() {
      const r = await engine.enqueueRun({
        scope: { kind: 'library' },
        axis: 'all',
        preset: 'standard',
        triggeredBy: 'manual',
      });
      return r.runId ?? null;
    },
  };
}

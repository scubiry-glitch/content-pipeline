// Meeting Notes Scheduler — cron 触发定时重算
//
// PR5: 两个任务
//   · project-auto-incremental: ⚠ F5 已默认关闭（见下方解释），保留代码以便重启
//   · library-monthly-recompute: 每月 1 日 02:00 对 LIBRARY 跑 axis=all + preset=standard
//
// F5 · 关掉 project-auto-incremental 的原因：
//   - 它订阅 'mn.meeting.parsed'，但 parseMeeting 是个幂等纯函数，runEngine
//     的 ingest 步骤每次都会调；意味着每跑一条 meeting-scope axis run 都会
//     反过来 enqueue 一条 project-scope full recompute，单次 ≈ ¥6-10，N 个
//     scope binding 就是 N×。实测 4-28 一天堆 30 条全 cancelled。
//   - 哪怕 dedupe 修了，"每次 parse 触发 project 全量重算"语义本身有问题：
//     名字叫 "incremental" 但实际是 full recompute，老 meeting 的事实被反复
//     重抽 LLM。
//   - 真要"上传后顺手刷新 project 视图"，应该走「dirty 标记 + 用户手动重算
//     按钮」或「真增量(只抽新 meeting 的 facts，project 层走 SQL aggregate)」，
//     而不是订阅一个跟 re-parse 重叠的事件。
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
  // F5 · 默认关闭。set MN_PROJECT_AUTO_INCREMENTAL=1 重新启用（仅在你修了
  // parseMeeting 的事件语义、确实想"每次内部 parse 都触发 project 全量重算"
  // 时再开）。
  const projectAutoIncrementalEnabled = process.env.MN_PROJECT_AUTO_INCREMENTAL === '1';
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

      if (projectAutoIncrementalEnabled) {
        deps.eventBus.subscribe('mn.meeting.parsed', meetingParsedHandler);
        console.log('[MeetingNotes/Scheduler] project auto-incremental ENABLED (MN_PROJECT_AUTO_INCREMENTAL=1)');
      } else {
        console.log('[MeetingNotes/Scheduler] project auto-incremental DISABLED (default since F5)');
      }

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
      if (projectAutoIncrementalEnabled) {
        deps.eventBus.unsubscribe('mn.meeting.parsed');
      }
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

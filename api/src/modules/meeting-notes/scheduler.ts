// Meeting Notes Scheduler — cron 触发 library-level 月度重算（PR1 骨架）
// 实际实现见 PR5；此处仅暴露 start/stop 接口，start() 为空操作

import type { MeetingNotesEngine } from './MeetingNotesEngine.js';

export interface SchedulerHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function startMeetingNotesScheduler(_engine: MeetingNotesEngine): SchedulerHandle {
  console.log('[MeetingNotes] Scheduler stub (no-op until PR5)');
  return {
    async start() {
      /* noop — PR5 */
    },
    async stop() {
      /* noop */
    },
  };
}

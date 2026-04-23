// v7.6 会议纪要定时采集调度器
//
// 与 hotScoreScheduler 同形，但按每个 meeting_note_source.schedule_cron 注册
// 独立的 cron 任务。调用 MeetingNoteChannelService.runImport(id, 'scheduled')。
//
// 约束：
// - 只调度 isActive && scheduleCron 非空 的源。
// - 无效 cron 字符串记录到 skipped[]，不抛异常。
// - 同一 source 的并发触发串行化（防抖）。
// - reload() 在 CRUD 后被调用，重建任务集。

import cron from 'node-cron';
import type { MeetingNoteChannelService } from './meetingNoteChannel.js';
import type { MeetingNoteSource } from './assetService.js';

type CronTask = ReturnType<typeof cron.schedule>;

export interface SkippedSource {
  sourceId: string;
  reason: 'invalid-cron' | 'inactive' | 'no-cron';
}

export class MeetingNoteScheduler {
  private tasks = new Map<string, CronTask>();
  private inFlight = new Set<string>();
  private _skipped: SkippedSource[] = [];
  private _running = false;

  constructor(private svc: MeetingNoteChannelService) {}

  get isRunning(): boolean { return this._running; }
  get activeCount(): number { return this.tasks.size; }
  get skipped(): SkippedSource[] { return [...this._skipped]; }

  async start(): Promise<void> {
    if (this._running) return;
    this._running = true;
    await this.syncTasks();
  }

  async reload(): Promise<void> {
    if (!this._running) return;
    await this.syncTasks();
  }

  stop(): void {
    for (const t of this.tasks.values()) {
      try { t.stop(); } catch { /* noop */ }
    }
    this.tasks.clear();
    this._skipped = [];
    this._running = false;
  }

  private async syncTasks(): Promise<void> {
    // 清掉旧任务
    for (const t of this.tasks.values()) {
      try { t.stop(); } catch { /* noop */ }
    }
    this.tasks.clear();
    this._skipped = [];

    const sources = await this.svc.listSources({ isActive: true });
    for (const s of sources) {
      if (!s.scheduleCron) {
        // 活跃但未配 cron —— 归为 no-cron，但不记入 skipped（非错误）
        continue;
      }
      if (!cron.validate(s.scheduleCron)) {
        this._skipped.push({ sourceId: s.id, reason: 'invalid-cron' });
        console.warn(`[MeetingNoteScheduler] invalid cron for source ${s.id}: ${s.scheduleCron}`);
        continue;
      }
      const task = cron.schedule(s.scheduleCron, () => this.tick(s));
      this.tasks.set(s.id, task);
    }
  }

  private async tick(source: MeetingNoteSource): Promise<void> {
    if (this.inFlight.has(source.id)) {
      // 上一次还没跑完就跳过，避免堆积
      return;
    }
    this.inFlight.add(source.id);
    try {
      await this.svc.runImport(source.id, 'scheduled');
    } catch (err) {
      console.error(
        `[MeetingNoteScheduler] scheduled import failed for ${source.id}:`,
        (err as Error)?.message || err,
      );
    } finally {
      this.inFlight.delete(source.id);
    }
  }
}

let singleton: MeetingNoteScheduler | null = null;

export function getMeetingNoteScheduler(svc: MeetingNoteChannelService): MeetingNoteScheduler {
  if (!singleton) singleton = new MeetingNoteScheduler(svc);
  return singleton;
}

export function resetMeetingNoteSchedulerForTests(): void {
  singleton = null;
}

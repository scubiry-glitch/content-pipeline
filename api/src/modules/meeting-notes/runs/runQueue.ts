// runs/runQueue.ts — 进程内 run 队列
//
// PR4：最小可用的 in-memory FIFO + concurrency cap
// P2 改造（worker-pool）：之前 drain() 一次抓全部 items 进 Promise.all
// 等所有完成才返回，期间新入队的不会被同一批 picked up；
// 现在改成 start(handler) 后 enqueue/finish 都触发 tick()，让新 items 立刻 picked up。
//
// 替换路径：通过 Adapter 接入 BullMQ / pg-boss 等分布式队列（P2 plan 的 B 段，未做）

export interface QueueItem<T = any> {
  id: string;        // 对应 mn_runs.id
  payload: T;
  enqueuedAt: number;
}

export class RunQueue<T = any> {
  private items: QueueItem<T>[] = [];
  private active = 0;
  private handler: ((item: QueueItem<T>) => Promise<void>) | null = null;

  constructor(private readonly concurrency: number = 2) {}

  /**
   * 启动 worker pool。RunEngine 构造时调用一次。
   * 不传 handler 则队列只接收 enqueue 但不消费（用于测试桩 / 暂停）。
   */
  start(handler: (item: QueueItem<T>) => Promise<void>): void {
    this.handler = handler;
    this.tick();
  }

  enqueue(item: QueueItem<T>): void {
    this.items.push(item);
    this.tick();
  }

  /**
   * 核心驱动：每次都 while 循环到容量打满或队列空，每个 worker 完成后再 tick 一次。
   * 同步函数，不 await — 启动 workers 后立即返回，让后续 enqueue 不被 await 阻塞。
   */
  private tick(): void {
    while (this.active < this.concurrency && this.items.length > 0 && this.handler) {
      const item = this.items.shift()!;
      this.active++;
      // 缓存 handler 引用避免 race condition（理论上 handler 不会再变，但保险起见）
      const h = this.handler;
      h(item)
        .catch((e) => console.error('[MeetingNotes/RunQueue] handler error:', e))
        .finally(() => {
          this.active--;
          // 完成后再 tick → 新 enqueue 进来的能立刻被 picked up
          this.tick();
        });
    }
  }

  stats() {
    return {
      pending: this.items.length,
      running: this.active,
      concurrency: this.concurrency,
    };
  }
}

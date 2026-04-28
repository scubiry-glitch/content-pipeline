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

  /**
   * F5 · 入队 dedupe：同一个 runId 在 pending 队列里只保留一条。
   * recoverQueuedRuns 每 60s 重 enqueue 全量 DB queued 行，没有这层 dedupe 会爆炸性堆积
   * (实测过 2664 条全是同 6 条 run 的重复入队)。
   * 返回 true=入队成功 / false=已存在被 skip。
   */
  enqueue(item: QueueItem<T>): boolean {
    if (this.items.some((existing) => existing.id === item.id)) {
      return false;
    }
    this.items.push(item);
    this.tick();
    return true;
  }

  /** 检查某个 id 是否已在 pending 队列 */
  has(id: string): boolean {
    return this.items.some((item) => item.id === id);
  }

  /** F5 · diagnostics 用：返回 pending items 的 id + enqueuedAt（最多 N 条） */
  peek(limit = 50): Array<{ id: string; enqueuedAt: number; ageMs: number }> {
    const now = Date.now();
    return this.items.slice(0, limit).map((item) => ({
      id: item.id,
      enqueuedAt: item.enqueuedAt,
      ageMs: now - item.enqueuedAt,
    }));
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

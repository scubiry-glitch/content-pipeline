// runs/runQueue.ts — 进程内 run 队列
//
// PR4：最小可用的 in-memory FIFO + concurrency cap
// 替换路径：通过 Adapter 接入 BullMQ / pg-boss 等分布式队列

export interface QueueItem<T = any> {
  id: string;        // 对应 mn_runs.id
  payload: T;
  enqueuedAt: number;
}

export class RunQueue<T = any> {
  private items: QueueItem<T>[] = [];
  private running = new Set<string>();

  constructor(private readonly concurrency: number = 2) {}

  enqueue(item: QueueItem<T>): void {
    this.items.push(item);
  }

  next(): QueueItem<T> | null {
    if (this.running.size >= this.concurrency) return null;
    const item = this.items.shift();
    if (!item) return null;
    this.running.add(item.id);
    return item;
  }

  finish(id: string): void {
    this.running.delete(id);
  }

  stats() {
    return {
      pending: this.items.length,
      running: this.running.size,
      concurrency: this.concurrency,
    };
  }

  /**
   * 驱动执行：只要有空位就拉 item 跑 handler。
   * handler 抛异常会打日志但不阻塞队列。
   */
  async drain(handler: (item: QueueItem<T>) => Promise<void>): Promise<void> {
    const promises: Promise<void>[] = [];
    while (true) {
      const item = this.next();
      if (!item) break;
      promises.push(
        handler(item)
          .catch((e) => console.error('[MeetingNotes/RunQueue] handler error:', e))
          .finally(() => this.finish(item.id)),
      );
    }
    await Promise.all(promises);
  }
}

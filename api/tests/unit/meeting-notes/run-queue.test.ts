/**
 * runs/runQueue — 进程内 FIFO + concurrency cap
 */
import { describe, it, expect, vi } from 'vitest';
import { RunQueue } from '../../../src/modules/meeting-notes/runs/runQueue.js';

describe('RunQueue', () => {
  it('FIFO dequeue', () => {
    const q = new RunQueue(10);
    q.enqueue({ id: 'a', payload: 1, enqueuedAt: 0 });
    q.enqueue({ id: 'b', payload: 2, enqueuedAt: 1 });
    q.enqueue({ id: 'c', payload: 3, enqueuedAt: 2 });
    expect(q.next()?.id).toBe('a');
    expect(q.next()?.id).toBe('b');
    expect(q.next()?.id).toBe('c');
    expect(q.next()).toBeNull();
  });

  it('respects concurrency cap', () => {
    const q = new RunQueue(2);
    q.enqueue({ id: '1', payload: 1, enqueuedAt: 0 });
    q.enqueue({ id: '2', payload: 1, enqueuedAt: 0 });
    q.enqueue({ id: '3', payload: 1, enqueuedAt: 0 });
    expect(q.next()?.id).toBe('1');
    expect(q.next()?.id).toBe('2');
    expect(q.next()).toBeNull();        // 第 3 个被挡住
    q.finish('1');
    expect(q.next()?.id).toBe('3');     // 释放一个位置后可继续
  });

  it('drain runs handler for each item until exhausted', async () => {
    const q = new RunQueue(3);
    for (let i = 0; i < 5; i++) {
      q.enqueue({ id: String(i), payload: i, enqueuedAt: 0 });
    }
    const processed: number[] = [];
    const handler = vi.fn(async (item: any) => { processed.push(item.payload); });

    await q.drain(handler);
    // 首轮 drain 最多取 3 个（并发上限）
    expect(processed.sort()).toEqual([0, 1, 2]);
    // 剩余 2 个仍在队列中
    expect(q.stats().pending).toBe(2);
  });

  it('handler errors do not block queue', async () => {
    const q = new RunQueue(2);
    q.enqueue({ id: 'ok', payload: 'ok', enqueuedAt: 0 });
    q.enqueue({ id: 'err', payload: 'err', enqueuedAt: 0 });
    const handler = vi.fn(async (item: any) => {
      if (item.payload === 'err') throw new Error('boom');
    });
    await q.drain(handler);
    expect(q.stats().running).toBe(0);  // 两个都完成（including failed）
  });

  it('stats reports pending + running + concurrency', () => {
    const q = new RunQueue(5);
    q.enqueue({ id: '1', payload: 1, enqueuedAt: 0 });
    q.enqueue({ id: '2', payload: 1, enqueuedAt: 0 });
    expect(q.stats()).toEqual({ pending: 2, running: 0, concurrency: 5 });
    q.next();
    expect(q.stats()).toEqual({ pending: 1, running: 1, concurrency: 5 });
  });
});

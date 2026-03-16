// Global Queue Manager - 单例模式确保所有服务使用同一队列

import { JobQueue } from './queue-simple.js';

const queues: Map<string, JobQueue> = new Map();

export function getQueue(name: string): JobQueue {
  if (!queues.has(name)) {
    queues.set(name, new JobQueue(name));
  }
  return queues.get(name)!;
}

export function listQueues(): string[] {
  return Array.from(queues.keys());
}

export async function closeAllQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
}

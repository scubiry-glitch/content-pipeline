// per-run SSE 事件注册表
// runEngine 在 succeeded / failed 时调 emitTerminal；
// oneshotRunner 在 onProgress 时调 emitProgress；
// router GET /runs/:id/stream 用 subscribe / unsubscribe 把事件推给客户端。

import { EventEmitter } from 'node:events';

export interface ProgressPayload {
  tokensSoFar: number;
  ratio: number;
  message: string;
}

export interface TerminalPayload {
  state: 'succeeded' | 'failed' | 'cancelled';
}

const registry = new Map<string, EventEmitter>();

function getOrCreate(runId: string): EventEmitter {
  if (!registry.has(runId)) {
    const ee = new EventEmitter();
    ee.setMaxListeners(20);
    registry.set(runId, ee);
  }
  return registry.get(runId)!;
}

export function emitProgress(runId: string, data: ProgressPayload): void {
  registry.get(runId)?.emit('progress', data);
}

export function emitTerminal(runId: string, state: TerminalPayload['state']): void {
  const ee = registry.get(runId);
  if (!ee) return;
  ee.emit('terminal', { state } satisfies TerminalPayload);
  // 10s 后清理，给慢客户端时间接收最后一条 terminal 事件
  setTimeout(() => registry.delete(runId), 10_000);
}

export function subscribe(
  runId: string,
  event: 'progress' | 'terminal',
  handler: (data: any) => void,
): void {
  getOrCreate(runId).on(event, handler);
}

export function unsubscribe(
  runId: string,
  event: 'progress' | 'terminal',
  handler: (data: any) => void,
): void {
  registry.get(runId)?.off(event, handler);
}

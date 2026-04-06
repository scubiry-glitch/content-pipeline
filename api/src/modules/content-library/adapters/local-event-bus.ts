// EventBusAdapter — 本地 EventEmitter 实现
// 嵌入模式使用，零网络开销

import { EventEmitter } from 'events';
import type { EventBusAdapter } from '../types.js';

export class LocalEventBus implements EventBusAdapter {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  async publish(event: string, payload: any): Promise<void> {
    this.emitter.emit(event, payload);
  }

  subscribe(event: string, handler: (payload: any) => Promise<void>): void {
    this.emitter.on(event, (payload) => {
      handler(payload).catch(err => {
        console.error(`[LocalEventBus] Error handling event ${event}:`, err);
      });
    });
  }

  unsubscribe(event: string): void {
    this.emitter.removeAllListeners(event);
  }
}
